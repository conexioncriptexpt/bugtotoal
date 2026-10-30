package pt.cryptoconex.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import org.webrtc.*

/**
 * Foreground service that owns an active assistance session: MediaProjection capture -> WebRTC (H.264 hardware encoder
 * via MediaCodec when available), signalling, remote commands routing. Visible notification at all times.
 */
class ScreenShareService : Service() {
    companion object {
        const val EXTRA_RESULT_CODE = "rc"
        const val EXTRA_DATA = "data"
        const val ACTION_STOP = "pt.cryptoconex.STOP"
        var instance: ScreenShareService? = null
        var listener: ((String, JSONObject) -> Unit)? = null
    }

    private lateinit var factory: PeerConnectionFactory
    private val egl: EglBase = EglBase.create()
    private var capturer: ScreenCapturerAndroid? = null
    private var source: VideoSource? = null
    private var track: VideoTrack? = null
    private var pc: PeerConnection? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    var signaling: SignalingClient? = null
    var sessionId: String? = null
    var controlAllowed = false
    private var iceServers: List<PeerConnection.IceServer> = emptyList()
    private val pending = mutableListOf<IceCandidate>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { endSession(true); return START_NOT_STICKY }
        startForegroundNotice()
        instance = this
        val rc = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java) else @Suppress("DEPRECATION") intent?.getParcelableExtra(EXTRA_DATA)
        if (data != null) startCapture(rc, data)
        acquireLocks()
        return START_NOT_STICKY
    }

    private fun startForegroundNotice() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("session", getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 1, Intent(this, ScreenShareService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 2, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n: Notification = NotificationCompat.Builder(this, "session")
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(getString(R.string.notif_channel))
            .setContentText(getString(R.string.notif_text)).setOngoing(true).setContentIntent(open)
            .addAction(0, getString(R.string.end), stop).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(42, n)
    }

    private fun acquireLocks() {
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "cryptoconex:session").apply { acquire(4 * 60 * 60 * 1000L) }
        @Suppress("DEPRECATION")
        wifiLock = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "cryptoconex:wifi").apply { acquire() }
    }

    private fun releaseLocks() {
        wakeLock?.takeIf { it.isHeld }?.release(); wakeLock = null
        wifiLock?.takeIf { it.isHeld }?.release(); wifiLock = null
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(this).createInitializationOptions())
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
        capturer = ScreenCapturerAndroid(data, object : MediaProjection.Callback() {
            override fun onStop() { endSession(true) }
        })
        source = factory.createVideoSource(true)
        val helper = SurfaceTextureHelper.create("capture", egl.eglBaseContext)
        captureHandler = helper.handler
        capturer!!.initialize(helper, this, repeatingObserver(source!!.capturerObserver))
        captureHandler?.postDelayed(repeatTick, REPEAT_MS)
        val dm = DisplayMetrics()
        @Suppress("DEPRECATION") (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(dm)
        // Scale down to <=1280 on the long side; WebRTC adapts resolution/framerate to bandwidth (degradation = BALANCED).
        val scale = minOf(1f, 1280f / maxOf(dm.widthPixels, dm.heightPixels))
        capturer!!.startCapture((dm.widthPixels * scale).toInt(), (dm.heightPixels * scale).toInt(), 15)
        track = factory.createVideoTrack("screen", source)
        track!!.addSink(thumbSink)
    }

    private var lastThumb = 0L
    private val REPEAT_MS = 250L
    private var captureHandler: android.os.Handler? = null
    @Volatile private var lastI420: VideoFrame.I420Buffer? = null
    @Volatile private var lastFrameAt = 0L
    private var downstream: CapturerObserver? = null

    // MediaProjection only emits frames when the screen changes: keep a copy and re-send it so a static screen still streams.
    private fun repeatingObserver(target: CapturerObserver): CapturerObserver {
        downstream = target
        return object : CapturerObserver {
            override fun onCapturerStarted(ok: Boolean) = target.onCapturerStarted(ok)
            override fun onCapturerStopped() = target.onCapturerStopped()
            // Deliver every frame as I420 with one monotonic clock: mixing texture/I420 buffers or capture/nanoTime
            // timestamps makes the encoder reset or drop frames (frozen image).
            override fun onFrameCaptured(frame: VideoFrame) {
                val copy = frame.buffer.toI420() ?: return
                lastI420?.release(); lastI420 = copy
                deliver(copy)
            }
        }
    }

    private fun deliver(buf: VideoFrame.I420Buffer) {
        buf.retain()
        val f = VideoFrame(buf, 0, System.nanoTime())
        downstream?.onFrameCaptured(f)
        f.release()
        lastFrameAt = System.currentTimeMillis()
    }

    private val repeatTick = object : Runnable {
        override fun run() {
            val buf = lastI420
            if (buf != null && System.currentTimeMillis() - lastFrameAt >= REPEAT_MS) deliver(buf)
            captureHandler?.postDelayed(this, REPEAT_MS)
        }
    }

    /** Every 3 s: small JPEG preview of the shared screen for the technician's device list. */
    private val thumbSink = VideoSink { frame ->
        val now = System.currentTimeMillis()
        if (now - lastThumb < 3000 || signaling == null) return@VideoSink
        lastThumb = now
        val w = 240; val h = (240f * frame.rotatedHeight / frame.rotatedWidth).toInt() and 0xFFFE
        val i420 = frame.buffer.cropAndScale(0, 0, frame.buffer.width, frame.buffer.height, w, h).toI420() ?: return@VideoSink
        try {
            val nv21 = ByteArray(w * h * 3 / 2)
            for (y in 0 until h) i420.dataY.position(y * i420.strideY).let { i420.dataY.get(nv21, y * w, w) }
            var o = w * h
            for (y in 0 until h / 2) for (x in 0 until w / 2) {
                nv21[o++] = i420.dataV.get(y * i420.strideV + x)
                nv21[o++] = i420.dataU.get(y * i420.strideU + x)
            }
            val out = java.io.ByteArrayOutputStream()
            android.graphics.YuvImage(nv21, android.graphics.ImageFormat.NV21, w, h, null).compressToJpeg(android.graphics.Rect(0, 0, w, h), 55, out)
            val b64 = android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
            emit("device:thumbnail", JSONObject().put("image", "data:image/jpeg;base64,$b64"))
        } finally { i420.release() }
    }

    fun setIce(servers: List<PeerConnection.IceServer>) { iceServers = servers }

    /** Called when technician:joined arrives: (re)create the peer connection and send an offer. */
    fun startPeer() {
        pc?.close()
        pending.clear()
        val cfg = PeerConnection.RTCConfiguration(iceServers).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        pc = factory.createPeerConnection(cfg, object : PeerConnection.Observer {
            override fun onIceCandidate(c: IceCandidate) {
                emit("webrtc:ice-candidate", JSONObject().put("candidate", JSONObject()
                    .put("candidate", c.sdp).put("sdpMid", c.sdpMid).put("sdpMLineIndex", c.sdpMLineIndex)))
            }
            override fun onConnectionChange(s: PeerConnection.PeerConnectionState) {
                emit("session:status", JSONObject().put("connection_state", s.name.lowercase()))
                if (s == PeerConnection.PeerConnectionState.FAILED) pc?.restartIce()
            }
            override fun onRenegotiationNeeded() {}
            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(p0: MediaStream?) {}
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(p0: DataChannel?) {}
            override fun onAddTrack(p0: RtpReceiver?, p1: Array<out MediaStream>?) {}
        })
        val sender = pc!!.addTrack(track, listOf("screen"))
        sender.parameters.let { p ->
            p.degradationPreference = RtpParameters.DegradationPreference.MAINTAIN_FRAMERATE
            p.encodings.forEach { e -> e.maxBitrateBps = 2_500_000; e.minBitrateBps = 300_000; e.maxFramerate = 15 }
            sender.parameters = p
        }
        pc!!.createOffer(object : SdpAdapter() {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc!!.setLocalDescription(SdpAdapter(), sdp)
                emit("webrtc:offer", JSONObject().put("sdp", JSONObject().put("type", "offer").put("sdp", sdp.description)))
            }
        }, MediaConstraints())
        val dm = resources.displayMetrics
        emit("session:status", JSONObject().put("resolution", "${dm.widthPixels}x${dm.heightPixels}"))
    }

    fun onAnswer(sdp: JSONObject) {
        pc?.setRemoteDescription(object : SdpAdapter() {
            override fun onSetSuccess() { pending.forEach { pc?.addIceCandidate(it) }; pending.clear() }
        }, SessionDescription(SessionDescription.Type.ANSWER, sdp.getString("sdp")))
    }

    fun onRemoteIce(c: JSONObject) {
        val cand = IceCandidate(c.optString("sdpMid"), c.optInt("sdpMLineIndex"), c.getString("candidate"))
        if (pc?.remoteDescription != null) pc?.addIceCandidate(cand) else pending.add(cand)
    }

    fun emit(event: String, data: JSONObject) {
        sessionId?.let { data.put("session_id", it) }
        signaling?.emit(event, data)
    }

    fun endSession(notifyServer: Boolean) {
        if (notifyServer && sessionId != null) emit("session:end", JSONObject())
        AssistAccessibilityService.instance?.hidePrivacy()
        captureHandler?.removeCallbacks(repeatTick); captureHandler = null
        runCatching { capturer?.stopCapture() }
        lastI420?.release(); lastI420 = null
        pc?.close(); pc = null
        capturer?.dispose(); source?.dispose()
        signaling?.close(); signaling = null
        sessionId = null; controlAllowed = false
        releaseLocks()
        listener?.invoke("local:ended", JSONObject())
        instance = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() { releaseLocks(); super.onDestroy() }
}

open class SdpAdapter : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(e: String?) {}
    override fun onSetFailure(e: String?) {}
}
