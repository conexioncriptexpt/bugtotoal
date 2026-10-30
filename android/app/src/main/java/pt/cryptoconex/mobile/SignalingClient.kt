package pt.cryptoconex.mobile

import android.os.Handler
import android.os.Looper
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import kotlin.math.min
import kotlin.random.Random

/** WebSocket signalling client (same protocol as the browser): {"event": "...", "data": {...}}. Exponential backoff reconnection. */
class SignalingClient(private val tokenProvider: () -> String, private val onEvent: (String, JSONObject) -> Unit,
                      private val onState: (Boolean) -> Unit) {
    private var ws: WebSocket? = null
    private var attempt = 0
    private var closed = false
    private val main = Handler(Looper.getMainLooper())

    fun connect() {
        closed = false
        val url = BuildConfig.BACKEND_URL.replaceFirst("http", "ws") + "/api/ws?kind=device&token=" + tokenProvider()
        ws = ApiClient.http.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                attempt = 0
                main.post { onState(true) }
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                val j = runCatching { JSONObject(text) }.getOrNull() ?: return
                main.post { onEvent(j.optString("event"), j.optJSONObject("data") ?: JSONObject()) }
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = retry()
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = retry()
        })
    }

    private fun retry() {
        main.post { onState(false) }
        if (closed) return
        val delay = min(30_000L, 1000L shl min(attempt, 5)) + Random.nextLong(500)
        attempt++
        main.postDelayed({ if (!closed) connect() }, delay)
    }

    fun emit(event: String, data: JSONObject) {
        ws?.send(JSONObject().put("event", event).put("data", data).toString())
    }

    fun close() {
        closed = true
        ws?.close(1000, "fim")
        ws = null
    }
}
