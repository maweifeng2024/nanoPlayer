import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val androidVersionCode = (groovy.json.JsonSlurper().parse(rootProject.file("../../../packaging/android/version-code.json")) as Map<*, *>)["versionCode"].toString().toInt()

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "app.nanoplayer.android"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "app.nanoplayer.android"
        minSdk = 29
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        targetSdk = 36
        versionCode = androidVersionCode
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            System.getenv("NANOPLAYER_ANDROID_KEYSTORE")?.let { storeFile = file(it) }
            storePassword = System.getenv("NANOPLAYER_ANDROID_STORE_PASSWORD")
            keyAlias = System.getenv("NANOPLAYER_ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("NANOPLAYER_ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = System.getenv("NANOPLAYER_ANDROID_NATIVE_DEBUG") == "1"
            isMinifyEnabled = false
            if (System.getenv("NANOPLAYER_ANDROID_NATIVE_DEBUG") == "1") {
                packaging { jniLibs.keepDebugSymbols.add("**/*.so") }
            }
        }
        getByName("release") {
            if (System.getenv("NANOPLAYER_ANDROID_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.media3:media3-session:1.11.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")