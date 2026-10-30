plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "pt.cryptoconex.mobile"
    compileSdk = 34

    defaultConfig {
        applicationId = "pt.cryptoconex.mobile"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        val backend = (project.findProperty("CC_BACKEND_URL") as String?) ?: "https://dominio.pt"
        buildConfigField("String", "BACKEND_URL", "\"$backend\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Configure signingConfigs via keystore.properties (never commit the keystore).
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-service:2.8.4")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    // WebRTC (hardware H.264 via MediaCodec through DefaultVideoEncoderFactory)
    implementation("io.github.webrtc-sdk:android:125.6422.04")
}
