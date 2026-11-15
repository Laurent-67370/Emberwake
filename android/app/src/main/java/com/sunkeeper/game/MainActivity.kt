package com.sunkeeper.game

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Sunkeeper for Android.
 *
 * The game engine (PPU model, Mode 7, synth, gameplay) is the same code as the
 * web version, bundled inside the APK and served from local assets — it runs
 * fully offline. This activity provides the native layer: immersive
 * full-screen landscape, physical controller mapping, haptics, pause on Back
 * and on app switch, and keeping the screen awake while playing.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val pad = mutableMapOf<String, Boolean>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // https://appassets.androidplatform.net/assets/... -> APK assets.
        // A real https origin is needed for ES modules and localStorage saves.
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            isFocusable = true
            isFocusableInTouchMode = true
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)

                // Never navigate away from the game.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.host != "appassets.androidplatform.net"
            }
            addJavascriptInterface(Bridge(), "SunkeeperNative")
        }
        setContentView(web)
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://appassets.androidplatform.net/assets/game/index.html")
        hideSystemBars()
    }

    private fun hideSystemBars() {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onPause() {
        js("window.__nativePause && window.__nativePause()")
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- controller
    private fun buttonFor(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> "up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
        KeyEvent.KEYCODE_BUTTON_A -> "jump"
        KeyEvent.KEYCODE_BUTTON_X -> "attack"
        KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_R2 -> "dash"
        KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_L2 -> "shoot"
        KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_MENU -> "start"
        KeyEvent.KEYCODE_BUTTON_SELECT -> "select"
        else -> null
    }

    private fun isGamepad(e: KeyEvent): Boolean {
        val s = e.source
        return (s and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
            (s and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
            (s and InputDevice.SOURCE_DPAD) == InputDevice.SOURCE_DPAD
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) js("window.__nativePause && window.__nativePause()")
            return true // Back pauses; leave the game with the Home gesture
        }
        val b = if (isGamepad(event)) buttonFor(event.keyCode) else null
        if (b != null) {
            if (event.repeatCount == 0) send(b, event.action == KeyEvent.ACTION_DOWN)
            return true
        }
        return super.dispatchKeyEvent(event) // keyboards keep working through the WebView
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        val joy = (event.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
        if (joy && event.action == MotionEvent.ACTION_MOVE) {
            val x = event.getAxisValue(MotionEvent.AXIS_X) + event.getAxisValue(MotionEvent.AXIS_HAT_X)
            val y = event.getAxisValue(MotionEvent.AXIS_Y) + event.getAxisValue(MotionEvent.AXIS_HAT_Y)
            send("left", x < -0.4f); send("right", x > 0.4f)
            send("up", y < -0.5f); send("down", y > 0.5f)
            send("dash", event.getAxisValue(MotionEvent.AXIS_RTRIGGER) > 0.5f || event.getAxisValue(MotionEvent.AXIS_GAS) > 0.5f)
            send("shoot", event.getAxisValue(MotionEvent.AXIS_LTRIGGER) > 0.5f || event.getAxisValue(MotionEvent.AXIS_BRAKE) > 0.5f)
            return true
        }
        return super.dispatchGenericMotionEvent(event)
    }

    private fun send(button: String, down: Boolean) {
        if (pad[button] == down) return
        pad[button] = down
        js("window.__nativeKey && window.__nativeKey('$button', $down)")
    }

    private fun js(code: String) {
        if (::web.isInitialized) web.evaluateJavascript(code, null)
    }

    // ---------------------------------------------------------------- JS bridge
    inner class Bridge {
        @JavascriptInterface
        fun vibrate(ms: Int) {
            val v: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (v?.hasVibrator() == true) {
                v.vibrate(VibrationEffect.createOneShot(ms.coerceIn(1, 1000).toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
            }
        }

        @JavascriptInterface
        fun platform(): String = "android"
    }
}
