package com.spek.intellij.core

import java.io.File

/**
 * 對齊 @spek/core 的 artifacts.ts：以檔案系統為準探索 change artifacts，
 * 排序委派給 openspec CLI（透過 SchemaOrderProvider）；CLI 不可用時退回預設排序。
 */
object ArtifactDiscovery {

    private val DEFAULT_ORDER = listOf("proposal", "design", "specs", "tasks")

    /** 由檔名（去副檔名）產生顯示標題：dash/underscore → 空格、字首大寫 */
    private fun humanize(stem: String): String {
        return stem.replace(Regex("""[-_]+"""), " ").trim()
            .split(" ")
            .joinToString(" ") { w -> if (w.isEmpty()) w else w.replaceFirstChar { it.uppercase() } }
    }

    /** 讀取 specs/ delta tree，依 topic 排序 */
    private fun readSpecsTree(changeDir: File): List<ChangeSpec> {
        val specsDir = File(changeDir, "specs")
        if (!specsDir.isDirectory) return emptyList()
        val out = mutableListOf<ChangeSpec>()
        specsDir.listFiles()
            ?.filter { it.isDirectory && !it.name.startsWith(".") }
            ?.forEach { topicDir ->
                val specFile = File(topicDir, "spec.md")
                if (specFile.exists()) out.add(ChangeSpec(topicDir.name, specFile.readText()))
            }
        return out.sortedBy { it.topic }
    }

    /** root *.md（忽略 dotfile/非 md），依檔名排序 */
    private fun rootMarkdownFiles(changeDir: File): List<File> {
        return changeDir.listFiles()
            ?.filter { it.isFile && !it.name.startsWith(".") && it.name.lowercase().endsWith(".md") }
            ?.sortedBy { it.name }
            ?: emptyList()
    }

    /** artifact 數量（root *.md + specs/ 非空各算一個），不讀內容 */
    fun count(changeDir: File): Int {
        if (!changeDir.exists()) return 0
        var n = rootMarkdownFiles(changeDir).size
        if (readSpecsTree(changeDir).isNotEmpty()) n += 1
        return n
    }

    /** 將 openspec artifact 的 outputPath 對應到已探索的 artifact key；對不到回 null */
    private fun keyForOutputPath(outputPath: String, built: Map<String, ChangeArtifact>): String? {
        val g = outputPath.trim()
        if (g.contains("*")) {
            if (Regex("""(^|/)specs(/|$)""").containsMatchIn(g) && built.containsKey("specs")) return "specs"
            return null
        }
        val base = g.split(Regex("""[\\/]""")).last()
        val stem = base.replace(Regex("""\.md$""", RegexOption.IGNORE_CASE), "")
        if (built.containsKey(stem)) return stem
        if (Regex("""^spec\.md$""", RegexOption.IGNORE_CASE).matches(base) &&
            Regex("specs", RegexOption.IGNORE_CASE).containsMatchIn(g) && built.containsKey("specs")
        ) return "specs"
        return null
    }

    fun discover(
        repoRoot: String,
        changeDir: File,
        slug: String?,
        orderProvider: SchemaOrderProvider = SchemaOrder.cli,
    ): List<ChangeArtifact> {
        if (!changeDir.exists()) return emptyList()

        val built = LinkedHashMap<String, ChangeArtifact>()

        for (file in rootMarkdownFiles(changeDir)) {
            val stem = file.name.replace(Regex("""\.md$""", RegexOption.IGNORE_CASE), "")
            val content = file.readText()
            if (file.name.equals("tasks.md", ignoreCase = true)) {
                built[stem] = ChangeArtifact(id = stem, title = humanize(stem), kind = "tasks", tasks = TaskParser.parse(content))
            } else {
                built[stem] = ChangeArtifact(id = stem, title = humanize(stem), kind = "markdown", content = content)
            }
        }

        val specs = readSpecsTree(changeDir)
        if (specs.isNotEmpty()) {
            built["specs"] = ChangeArtifact(id = "specs", title = "Specs", kind = "specs", specs = specs)
        }

        val refs = if (slug != null) orderProvider.order(repoRoot, slug) else null

        val ordered = mutableListOf<ChangeArtifact>()
        val usedIds = HashSet<String>()

        if (refs != null) {
            for (ref in refs) {
                val key = keyForOutputPath(ref.outputPath, built)
                if (key != null && !usedIds.contains(key)) {
                    ordered.add(built.getValue(key))
                    usedIds.add(key)
                }
            }
        }

        val remaining = built.keys.filter { !usedIds.contains(it) }.sortedWith(
            Comparator { a, b ->
                val ia = DEFAULT_ORDER.indexOf(a).let { if (it == -1) Int.MAX_VALUE else it }
                val ib = DEFAULT_ORDER.indexOf(b).let { if (it == -1) Int.MAX_VALUE else it }
                if (ia != ib) ia - ib else a.compareTo(b)
            }
        )
        for (id in remaining) ordered.add(built.getValue(id))

        return ordered
    }
}
