plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sunkeeper.game"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sunkeeper.game"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the release APK installs out of the box.
            // Replace with your own keystore before publishing on a store.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDirs(layout.buildDirectory.dir("generated/gameAssets"))
}

// The game itself lives at the repository root (index.html + src/). It is
// copied into the APK's assets at build time so there is a single source.
val copyGame by tasks.registering(Copy::class) {
    from(rootProject.projectDir.parentFile) {
        include("index.html", "manifest.webmanifest", "icon.svg", "src/**")
    }
    into(layout.buildDirectory.dir("generated/gameAssets/game"))
}
tasks.named("preBuild") { dependsOn(copyGame) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}
