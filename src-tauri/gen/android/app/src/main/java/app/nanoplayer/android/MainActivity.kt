package app.nanoplayer.android

import android.os.Bundle
import android.graphics.Color
import androidx.activity.SystemBarStyle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val surface = Color.rgb(24, 24, 27)
    enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(surface), navigationBarStyle = SystemBarStyle.dark(surface))
    super.onCreate(savedInstanceState)
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(surface)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom))
      WindowInsetsCompat.CONSUMED
    }
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        fun findWebView(view: View): WebView? {
          if (view is WebView) return view
          if (view is ViewGroup) for (i in 0 until view.childCount) findWebView(view.getChildAt(i))?.let { return it }
          return null
        }
        findWebView(content)?.evaluateJavascript("window.dispatchEvent(new Event('android-back', {cancelable:true}))", null)
          ?: moveTaskToBack(true)
      }
    })
  }
}
