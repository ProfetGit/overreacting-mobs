plugins {
    id("dev.kikugie.stonecutter")
    id("net.fabricmc.fabric-loom") version "1.18.2" apply false
    id("net.neoforged.moddev") version "2.0.147" apply false
    id("net.minecraftforge.gradle") version "7.0.40" apply false
}

stonecutter active "26.3-fabric"

stonecutter parameters {
    constants.match(current.project.substringAfterLast('-'), "fabric", "neoforge", "forge")
}

tasks.register<Copy>("dist") {
    group = "build"
    description = "Builds every target and copies the jars into dist/"
    val skip = providers.gradleProperty("mr.skip").orNull?.split(',')?.map { it.trim() }.orEmpty()
    stonecutter.versions.filter { v -> skip.none { v.project.endsWith("-$it") || v.project == it } }.forEach { v ->
        val p = project(":${v.project}")
        dependsOn(p.tasks.named("build"))
        from(p.layout.buildDirectory.dir("libs")) {
            include("mobreactions-*.jar")
            exclude("*-sources.jar", "*-dev.jar")
        }
    }
    into(layout.projectDirectory.dir("dist"))
    doFirst { delete(layout.projectDirectory.dir("dist")) }
}

// Compile-time stand-ins for the optional Entity Model Features API (dev/stubs/emf). Never shipped: the mod only
// reaches EMF through them when EMF is loaded (compat/Emf, compat/EmfHook).
tasks.register<JavaCompile>("emfStubs") {
    source(fileTree("dev/stubs/emf"))
    classpath = files()
    destinationDirectory = layout.buildDirectory.dir("emf-stubs")
    sourceCompatibility = "21"
    targetCompatibility = "21"
    options.release = 21
}
