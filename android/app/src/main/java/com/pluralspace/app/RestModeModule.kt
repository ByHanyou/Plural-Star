package com.pluralspace.app

import android.content.Context
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

class RestModeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "RestMode"

    @ReactMethod
    fun configure(notifications: Boolean, enabled: Boolean, start: Int, end: Int, promise: Promise) {
        // Invalid imported schedules are retained as -1 and suppress delivery until corrected.
        val saved = context.getSharedPreferences("plural_star_rest", Context.MODE_PRIVATE).edit()
            .putBoolean("notifications", notifications)
            .putBoolean("enabled", enabled)
            .putInt("start", if (start in 0..1439) start else -1)
            .putInt("end", if (end in 0..1439) end else -1)
            .commit()
        if (saved) promise.resolve(null)
        else promise.reject("REST_MODE_SAVE", "Could not save notification schedule")
    }
}

class RestModePackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(RestModeModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
