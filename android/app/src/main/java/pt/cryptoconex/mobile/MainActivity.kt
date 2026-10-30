package pt.cryptoconex.mobile

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.concurrent.Executors

class SplashActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.postDelayed({ startActivity(Intent(this, MainActivity::class.java)); finish() }, 900)
    }
}

/** Single-screen UI: logo, big CONECTAR button, status, big TERMINAR button. No account, no menus. */
class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var connectBtn: Button
    private lateinit var endBtn: Button
    private val io = Executors.newSingleThreadExecutor()
    private var token: String? = null
    private var techName = ""
    private var linkToken: String? = null

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        linkToken = intent?.data?.lastPathSegment
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(24), dp(24), dp(24), dp(24)) }
        root.addView(ImageView(this).apply { setImageResource(R.drawable.logo); adjustViewBounds = true; contentDescription = "Suporte Técnico Avançado" }, LinearLayout.LayoutParams(dp(300), LinearLayout.LayoutParams.WRAP_CONTENT))
        status = TextView(this).apply { textSize = 22f; gravity = Gravity.CENTER; setText(R.string.status_idle); setPadding(0, dp(24), 0, dp(24)) }
        root.addView(status)
        connectBtn = Button(this).apply {
            setText(R.string.connect); textSize = 30f; setBackgroundColor(getColor(R.color.cc_lime)); setTextColor(0xFF000000.toInt())
            contentDescription = "Conectar ao técnico"; setOnClickListener { onConnect() }
        }
        root.addView(connectBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(96)))
        endBtn = Button(this).apply {
            setText(R.string.end); textSize = 22f; setBackgroundColor(getColor(R.color.cc_red)); setTextColor(0xFFFFFFFF.toInt())
            visibility = View.GONE; setOnClickListener { onEnd() }
        }
        root.addView(endBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(80)).apply { topMargin = dp(16) })
        root.addView(Button(this).apply {
            setText(R.string.a11y_setup_title); textSize = 16f; setBackgroundColor(0); setTextColor(getColor(R.color.cc_muted))
            setOnClickListener { startActivity(Intent(this@MainActivity, AccessibilitySetupActivity::class.java)) }
        })
        root.addView(TextView(this).apply { setText(R.string.privacy_note); textSize = 14f; gravity = Gravity.CENTER; setTextColor(getColor(R.color.cc_muted)) })
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        ScreenShareService.listener = { ev, d -> onServerEvent(ev, d) }
    }

    /** 1) MediaProjection consent (system dialog) -> 2) register device + request -> 3) foreground service + signalling. */
    private fun onConnect() {
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        @Suppress("DEPRECATION") startActivityForResult(mpm.createScreenCaptureIntent(), 100)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != 100 || resultCode != RESULT_OK || data == null) { status.text = "Partilha não autorizada. Carrega em CONECTAR de novo."; return }
        startForegroundService(Intent(this, ScreenShareService::class.java)
            .putExtra(ScreenShareService.EXTRA_RESULT_CODE, resultCode).putExtra(ScreenShareService.EXTRA_DATA, data))
        status.text = "A ligar…"
        connectBtn.visibility = View.GONE; endBtn.visibility = View.VISIBLE
        io.execute {
            try {
                val res = ApiClient.connect(this, linkToken)
                val ice = ApiClient.iceServers(res.token)
                token = res.token
                runOnUiThread {
                    val svc = ScreenShareService.instance ?: return@runOnUiThread
                    svc.setIce(ice)
                    svc.signaling = SignalingClient({ token!! }, { ev, d -> onServerEvent(ev, d) }, { online ->
                        if (!online && svc.sessionId != null) status.setText(R.string.status_reconnecting)
                    }).also { it.connect() }
                    status.setText(R.string.status_waiting)
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Sem ligação ao servidor. Verifica a internet."; resetUi() }
                ScreenShareService.instance?.endSession(false)
            }
        }
    }

    private fun onServerEvent(ev: String, d: JSONObject) {
        val svc = ScreenShareService.instance
        when (ev) {
            "connected" -> d.optJSONObject("session")?.let { svc?.sessionId = it.getString("id"); techName = it.optString("technician_name") }
            "support:assigned", "session:transferred" -> d.optJSONObject("session")?.let {
                svc?.sessionId = it.getString("id"); techName = it.optString("technician_name")
                status.text = getString(R.string.status_assigned, techName)
            }
            "session:started" -> askConsent()
            "technician:joined" -> { techName = d.optString("technician_name", techName); svc?.sessionId = d.optString("session_id"); svc?.startPeer() }
            "webrtc:answer" -> d.optJSONObject("sdp")?.let { svc?.onAnswer(it) }
            "webrtc:ice-candidate" -> d.optJSONObject("candidate")?.let { svc?.onRemoteIce(it) }
            "remote:command" -> d.optJSONObject("command")?.let { AssistAccessibilityService.instance?.handle(it) }
            "privacy:enabled" -> AssistAccessibilityService.instance?.showPrivacy()
            "privacy:disabled" -> AssistAccessibilityService.instance?.hidePrivacy()
            "support:rejected" -> { svc?.sessionId = null; status.setText(R.string.status_waiting) }
            "session:ended", "support:cancelled" -> { svc?.endSession(false); status.setText(R.string.status_ended); resetUi() }
            "local:ended" -> { status.setText(R.string.status_ended); resetUi() }
        }
    }

    /** Explicit consent: view only, or view + assisted control (requires the accessibility service to be enabled). */
    private fun askConsent() {
        val svc = ScreenShareService.instance ?: return
        AlertDialog.Builder(this).setTitle(R.string.consent_title)
            .setMessage(getString(R.string.consent_msg, techName)).setCancelable(false)
            .setNegativeButton(R.string.consent_view_only) { _, _ -> sendConsent(false) }
            .setPositiveButton(R.string.consent_control) { _, _ ->
                if (AssistAccessibilityService.instance == null) startActivity(Intent(this, AccessibilitySetupActivity::class.java))
                sendConsent(true)
            }.show()
        status.text = getString(R.string.status_active, techName)
        svc.emit("session:status", JSONObject().put("connection_state", "a ligar"))
    }

    private fun sendConsent(control: Boolean) {
        val svc = ScreenShareService.instance ?: return
        svc.controlAllowed = control
        svc.emit("consent:update", JSONObject().put("screen", true).put("control", control))
    }

    private fun onEnd() {
        val svc = ScreenShareService.instance
        if (svc?.sessionId == null) token?.let { t -> io.execute { ApiClient.cancel(t) } }
        svc?.endSession(true)
        status.setText(R.string.status_ended); resetUi()
    }

    private fun resetUi() { connectBtn.visibility = View.VISIBLE; endBtn.visibility = View.GONE }
}

/** Simple screen explaining and opening Android's Accessibility settings. */
class AccessibilitySetupActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply { setText(R.string.a11y_setup_title); textSize = 26f; gravity = Gravity.CENTER })
            addView(TextView(context).apply { setText(R.string.a11y_setup_msg); textSize = 18f; gravity = Gravity.CENTER; setPadding(0, pad, 0, pad) })
            addView(Button(context).apply {
                setText(R.string.a11y_open_settings); textSize = 22f; setBackgroundColor(getColor(R.color.cc_lime)); setTextColor(0xFF000000.toInt())
                setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            })
        })
    }
}
