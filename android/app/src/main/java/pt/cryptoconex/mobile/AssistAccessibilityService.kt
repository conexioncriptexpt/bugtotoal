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
import android.widget.Button
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
        val dm = resources.displayMetrics
        fun px(k: String, size: Int) = (cmd.optDouble(k, 0.5).coerceIn(0.0, 1.0) * size).toFloat()
        when (cmd.optString("type")) {
            "click" -> tap(px("x", dm.widthPixels), px("y", dm.heightPixels), 60)
            "long_press" -> tap(px("x", dm.widthPixels), px("y", dm.heightPixels), 700)
            "double_click" -> { tap(px("x", dm.widthPixels), px("y", dm.heightPixels), 50); tap(px("x", dm.widthPixels), px("y", dm.heightPixels), 50) }
            "scroll", "swipe" -> {
                val dy = cmd.optInt("dy", 3)
                val cx = dm.widthPixels / 2f; val cy = dm.heightPixels / 2f
                swipe(cx, cy, cx, (cy - dy * dm.heightPixels / 10f).coerceIn(10f, dm.heightPixels - 10f))
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

    private fun tap(x: Float, y: Float, ms: Long) {
        val p = Path().apply { moveTo(x, y) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, ms)).build(), null, null)
    }

    private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float) {
        val p = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, 350)).build(), null, null)
    }

    /** Privacy overlay (TYPE_ACCESSIBILITY_OVERLAY). Always includes a button so the user can switch it off. */
    fun showPrivacy(requested: Boolean = false) {
        if (overlay != null) { overlay?.findViewWithTag<TextView>("req")?.visibility = if (requested) 0 else 8; return }
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(Color.BLACK)
            addView(TextView(context).apply { text = getString(R.string.privacy_msg); textSize = 28f; setTextColor(Color.WHITE); gravity = Gravity.CENTER })
            addView(TextView(context).apply { tag = "req"; text = "O técnico pede para desligares este modo."; setTextColor(Color.YELLOW); visibility = if (requested) 0 else 8 })
            addView(Button(context).apply {
                text = getString(R.string.privacy_disable); textSize = 22f
                setOnClickListener { ScreenShareService.instance?.emit("privacy:disable", JSONObject()) }
            })
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
