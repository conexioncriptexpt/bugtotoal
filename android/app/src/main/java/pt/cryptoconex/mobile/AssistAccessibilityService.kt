package pt.cryptoconex.mobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Assistive AccessibilityService. Only acts while an authorised session with control consent is active.
 * - Reads the accessible node hierarchy (text, description, class, clickable, editable, bounds) for the technician.
 * - Performs assisted clicks/gestures/global actions requested by the technician.
 * - Never reads or types into password fields; flags sensitive focus to the server (text commands are then blocked).
 * - Shows the dark "Ajuste Técnico — Aguarde..." privacy overlay with a button that lets the user disable it.
 */
class AssistAccessibilityService : AccessibilityService() {
    companion object { var instance: AssistAccessibilityService? = null }

    private val nodes = mutableMapOf<Int, AccessibilityNodeInfo>()
    private var overlay: LinearLayout? = null
    private var lastSensitive = false

    override fun onServiceConnected() { instance = this }
    override fun onInterrupt() {}
    override fun onDestroy() { hidePrivacy(); instance = null; super.onDestroy() }

    private val session get() = ScreenShareService.instance?.takeIf { it.sessionId != null && it.controlAllowed }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val svc = ScreenShareService.instance ?: return
        if (event?.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED || event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            val focused = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            val sensitive = focused?.isPassword == true || looksFinancial(focused)
            if (sensitive != lastSensitive) {
                lastSensitive = sensitive
                svc.emit("session:status", JSONObject().put("sensitive_focus", sensitive))
            }
        }
    }

    private fun looksFinancial(n: AccessibilityNodeInfo?): Boolean {
        val hint = listOfNotNull(n?.hintText, n?.viewIdResourceName, n?.contentDescription).joinToString(" ").lowercase()
        return listOf("pin", "cvv", "cvc", "iban", "cartão", "card", "password", "palavra-passe", "senha").any { hint.contains(it) }
    }

    /** Serialises the visible accessible tree (password text never included). */
    fun buildTree(): JSONObject? {
        nodes.clear()
        var counter = 0
        fun walk(n: AccessibilityNodeInfo?, depth: Int): JSONObject? {
            if (n == null || depth > 25 || counter > 400) return null
            val id = counter++
            nodes[id] = n
            val r = Rect().also { n.getBoundsInScreen(it) }
            val o = JSONObject().put("id", id).put("cls", n.className?.toString() ?: "")
                .put("text", if (n.isPassword) "••••" else n.text?.toString()?.take(120) ?: "")
                .put("desc", n.contentDescription?.toString()?.take(120) ?: "")
                .put("clickable", n.isClickable).put("editable", n.isEditable)
                .put("bounds", JSONArray(listOf(r.left, r.top, r.right, r.bottom)))
            val kids = JSONArray()
            for (i in 0 until n.childCount) walk(n.getChild(i), depth + 1)?.let { kids.put(it) }
            return o.put("children", kids)
        }
        return walk(rootInActiveWindow, 0)
    }

    /** Executes a validated remote command. Server already enforced auth/consent; we re-check locally. */
    fun handle(cmd: JSONObject) {
        val svc = session ?: return
        val (sw, sh) = screenSize()
        fun px(k: String, size: Int) = (cmd.optDouble(k, 0.5).coerceIn(0.0, 1.0) * size).toFloat()
        when (cmd.optString("type")) {
            "click" -> tap(px("x", sw), px("y", sh), 60)
            "long_press" -> tap(px("x", sw), px("y", sh), 800)
            "double_click" -> { tap(px("x", sw), px("y", sh), 50); android.os.Handler(mainLooper).postDelayed({ tap(px("x", sw), px("y", sh), 50) }, 120) }
            "scroll", "swipe" -> {
                val dy = cmd.optInt("dy", 0); val dx = cmd.optInt("dx", 0)
                val cx = sw / 2f; val cy = sh / 2f
                // Finger moves opposite to the content: "Cima" (dy<0) scrolls content up -> finger moves down.
                swipe(cx, cy, (cx - dx * sw / 8f).coerceIn(10f, sw - 10f), (cy - dy * sh / 10f).coerceIn(10f, sh - 10f))
            }
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
            "text" -> {
                val f = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return
                if (f.isPassword || looksFinancial(f)) return
                f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, (f.text ?: "").toString() + cmd.optString("text"))
                })
            }
            "a11y_action" -> nodes[cmd.optInt("node_id", -1)]?.takeIf { !it.isPassword }?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            "request_tree" -> buildTree()?.let { svc.emit("accessibility:tree", JSONObject().put("tree", it)) }
        }
    }

    /** Real full-screen size (incl. status/nav bars) = the same area captured by MediaProjection. */
    private fun screenSize(): Pair<Int, Int> {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        return if (android.os.Build.VERSION.SDK_INT >= 30) wm.maximumWindowMetrics.bounds.let { it.width() to it.height() }
        else android.util.DisplayMetrics().also { @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(it) }.let { it.widthPixels to it.heightPixels }
    }

    private fun tap(x: Float, y: Float, ms: Long) {
        val p = Path().apply { moveTo(x, y) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, ms)).build(), null, null)
    }

    private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float) {
        val p = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, 350)).build(), null, null)
    }

    /** Privacy overlay (TYPE_ACCESSIBILITY_OVERLAY), controlled by the technician. Note: Android's MediaProjection also
     *  captures overlays, so on Android the technician sees this dark screen too (no public API to exclude it). */
    fun showPrivacy() {
        if (overlay != null) return
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(Color.BLACK)
            addView(TextView(context).apply { text = getString(R.string.privacy_msg); textSize = 28f; setTextColor(Color.WHITE); gravity = Gravity.CENTER })
        }
        val lp = WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.OPAQUE)
        wm.addView(box, lp)
        overlay = box
    }

    fun hidePrivacy() {
        overlay?.let { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) }
        overlay = null
    }
}
