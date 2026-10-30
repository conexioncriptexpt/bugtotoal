package pt.cryptoconex.mobile

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.PeerConnection
import java.util.UUID
import java.util.concurrent.TimeUnit

/** REST calls to the Crypto Conex backend. The device never stores TURN credentials: they are fetched per session. */
object ApiClient {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .pingInterval(25, TimeUnit.SECONDS)
        .build()
    private val JSON = "application/json".toMediaType()

    /** Installation id generated once by the app (no hardware fingerprinting). */
    fun installationId(ctx: Context): String {
        val prefs = ctx.getSharedPreferences("cc", Context.MODE_PRIVATE)
        return prefs.getString("installation_id", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("installation_id", it).apply()
        }
    }

    data class ConnectResult(val deviceId: String, val token: String, val technicianName: String?, val sessionJson: JSONObject?)

    fun connect(ctx: Context, linkToken: String?): ConnectResult {
        val dm = ctx.resources.displayMetrics
        val body = JSONObject()
            .put("installation_id", installationId(ctx))
            .put("platform", "android")
            .put("os", "Android")
            .put("os_version", android.os.Build.VERSION.RELEASE)
            .put("client_name", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
            .put("screen", "${dm.widthPixels}x${dm.heightPixels}")
            .put("link_token", linkToken ?: JSONObject.NULL)
        val req = Request.Builder().url("${BuildConfig.BACKEND_URL}/api/public/connect")
            .post(body.toString().toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error("HTTP ${r.code}")
            val j = JSONObject(r.body!!.string())
            return ConnectResult(j.getString("device_id"), j.getString("device_token"),
                j.optString("technician_name").ifEmpty { null }, j.optJSONObject("session"))
        }
    }

    fun iceServers(token: String): List<PeerConnection.IceServer> {
        val req = Request.Builder().url("${BuildConfig.BACKEND_URL}/api/ice-servers")
            .header("Authorization", "Bearer $token").header("x-client-kind", "device").build()
        http.newCall(req).execute().use { r ->
            val arr = JSONObject(r.body!!.string()).getJSONArray("iceServers")
            return (0 until arr.length()).map { i ->
                val s = arr.getJSONObject(i)
                val urls = s.opt("urls").let { if (it is JSONArray) (0 until it.length()).map { k -> it.getString(k) } else listOf(it.toString()) }
                PeerConnection.IceServer.builder(urls)
                    .setUsername(s.optString("username", ""))
                    .setPassword(s.optString("credential", ""))
                    .createIceServer()
            }
        }
    }

    fun cancel(token: String) {
        val req = Request.Builder().url("${BuildConfig.BACKEND_URL}/api/public/cancel")
            .header("Authorization", "Bearer $token").header("x-client-kind", "device")
            .post("{}".toRequestBody(JSON)).build()
        runCatching { http.newCall(req).execute().close() }
    }
}
