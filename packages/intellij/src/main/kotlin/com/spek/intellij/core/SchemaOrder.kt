package com.spek.intellij.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.util.concurrent.TimeUnit

/** schema 中單一 artifact 的權威參照（由 openspec CLI 提供） */
data class SchemaArtifactRef(
    val id: String,
    val outputPath: String,
)

/**
 * 提供某個 change 的權威 artifact 順序。回 null 代表無法取得（CLI 不存在、archived change、
 * 或任何錯誤），此時呼叫端退回檔案系統預設排序。對齊 @spek/core 的 SchemaOrderProvider。
 */
fun interface SchemaOrderProvider {
    fun order(repoRoot: String, slug: String): List<SchemaArtifactRef>?
}

object SchemaOrder {
    private val json = Json { ignoreUnknownKeys = true }
    private val cache = HashMap<String, List<SchemaArtifactRef>?>()

    /**
     * 由 `openspec status --change <slug> --json` 輸出萃取權威順序：
     * actionContext.planningArtifacts 提供順序，artifactPaths[id].outputPath 提供產出路徑。
     * 純函式，方便單元測試；解析不出任何 artifact 時回 null。
     */
    fun parseOrderFromStatus(jsonText: String): List<SchemaArtifactRef>? {
        return try {
            val root = json.parseToJsonElement(jsonText).jsonObject
            val order = root["actionContext"]?.jsonObject?.get("planningArtifacts")?.jsonArray ?: return null
            val paths = root["artifactPaths"]?.jsonObject ?: return null
            val refs = mutableListOf<SchemaArtifactRef>()
            for (el in order) {
                val id = el.jsonPrimitive.takeIf { it.isString }?.content ?: continue
                val outputPath = paths[id]?.jsonObject?.get("outputPath")?.jsonPrimitive
                    ?.takeIf { it.isString }?.content ?: continue
                refs.add(SchemaArtifactRef(id, outputPath))
            }
            if (refs.isNotEmpty()) refs else null
        } catch (_: Exception) {
            null
        }
    }

    /**
     * 預設 SchemaOrderProvider：呼叫 openspec CLI 取得權威順序。
     * openspec 未安裝 / 非 0 結束 / archived change / 解析失敗時一律回 null（退回預設排序）。
     */
    val cli = SchemaOrderProvider { repoRoot, slug ->
        val cacheKey = "$repoRoot::$slug"
        if (cache.containsKey(cacheKey)) return@SchemaOrderProvider cache[cacheKey]

        var result: List<SchemaArtifactRef>? = null
        // slug 來自資料夾名稱；限定安全字元後才帶入
        if (Regex("""^[\w.-]+$""").matches(slug)) {
            try {
                val bin = if (System.getProperty("os.name").orEmpty().lowercase().contains("win"))
                    "openspec.cmd" else "openspec"
                val proc = ProcessBuilder(bin, "status", "--change", slug, "--json")
                    .directory(File(repoRoot))
                    .redirectErrorStream(false)
                    .start()
                val out = proc.inputStream.bufferedReader().readText()
                val finished = proc.waitFor(10, TimeUnit.SECONDS)
                if (finished && proc.exitValue() == 0) {
                    result = parseOrderFromStatus(out)
                } else if (!finished) {
                    proc.destroyForcibly()
                }
            } catch (_: Exception) {
                result = null
            }
        }

        cache[cacheKey] = result
        result
    }

    fun clearCache() = cache.clear()
}
