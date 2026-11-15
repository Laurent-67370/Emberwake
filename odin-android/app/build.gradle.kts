plugins {
    id("com.android.application")
}

// Odin's sources, fetched and patched by fetch-odin.sh (see README.md)
val odinSrc = rootProject.file("odin-src")
val glslang = System.getenv("GLSLANG") ?: "/usr/bin/glslangValidator"

android {
    namespace = "org.odinport.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.odinport.android"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "0.1-" + (System.getenv("ODIN_COMMIT") ?: "dev").take(7)

        ndk { abiFilters += listOf("arm64-v8a") }
        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DANDROID_STL=c++_shared",
                    "-DODIN_BUNDLED_LIBS=ON",
                    "-DODIN_NATIVE=OFF",
                    "-DGLSLANG=$glslang",
                    "-DAWK=/usr/bin/awk",
                    "-DODIN_VERSION=android-" + (System.getenv("ODIN_COMMIT") ?: "dev").take(7),
                )
                targets += listOf("odin", "SDL3-shared")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("${odinSrc}/CMakeLists.txt")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so that the APK installs as it is.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // SDL's Java side, from the same SDL that is built in
    sourceSets["main"].java.srcDirs("${odinSrc}/3rdparty/SDL/android-project/app/src/main/java")
    sourceSets["main"].assets.srcDirs(layout.buildDirectory.dir("generated/odinAssets"))
    packaging { jniLibs { useLegacyPackaging = false } }
}

// Odin's data (game list, picture filters compiled to SPIR-V), unpacked by
// SetupActivity at the first start
val odinData by tasks.registering(Exec::class) {
    val out = layout.buildDirectory.dir("generated/odinAssets/odin").get().asFile
    inputs.dir(odinSrc.resolve("filters"))
    inputs.file(odinSrc.resolve("odin-games.json"))
    outputs.dir(out)
    environment("GLSLANG", glslang)
    commandLine("sh", rootProject.file("tools/build-data.sh").path, odinSrc.path, out.path)
}
tasks.named("preBuild") { dependsOn(odinData) }
