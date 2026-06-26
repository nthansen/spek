package com.spek.intellij.core

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ArtifactDiscoveryTest {

    private val tempDirs = mutableListOf<File>()

    private fun mkRepo(): File {
        val dir = Files.createTempDirectory("spek-kt-test-").toFile()
        tempDirs.add(dir)
        return dir
    }

    private fun writeChange(repo: File, slug: String, files: Map<String, String>): File {
        val changeDir = File(repo, "openspec/changes/$slug")
        changeDir.mkdirs()
        for ((rel, content) in files) {
            val full = File(changeDir, rel)
            full.parentFile.mkdirs()
            full.writeText(content)
        }
        return changeDir
    }

    // 永遠回 null 的 provider（模擬 openspec CLI 不可用）
    private val noOrder = SchemaOrderProvider { _, _ -> null }

    // 回固定順序的 provider（模擬 openspec CLI 權威順序）
    private fun orderOf(vararg refs: SchemaArtifactRef) = SchemaOrderProvider { _, _ -> refs.toList() }

    @AfterTest
    fun cleanup() {
        tempDirs.forEach { it.deleteRecursively() }
        SchemaOrder.clearCache()
    }

    @Test
    fun specDrivenChangeUsesDefaultOrderWithoutProvider() {
        val repo = mkRepo()
        val changeDir = writeChange(
            repo, "add-foo",
            mapOf(
                "proposal.md" to "## Why\n",
                "design.md" to "## Context\n",
                "tasks.md" to "## 1. Group\n\n- [x] 1.1 done\n- [ ] 1.2 todo\n",
                "specs/foo/spec.md" to "## ADDED Requirements\n",
            ),
        )
        val arts = ArtifactDiscovery.discover(repo.absolutePath, changeDir, "add-foo", noOrder)
        assertEquals(listOf("proposal", "design", "specs", "tasks"), arts.map { it.id })
        assertEquals("specs", arts[2].kind)
        assertEquals("tasks", arts[3].kind)
        assertEquals(2, arts[3].tasks?.total)
        assertEquals(1, arts[3].tasks?.completed)
        assertEquals(listOf("foo"), arts[2].specs?.map { it.topic })
    }

    @Test
    fun customSchemaFilesAllSurface() {
        val repo = mkRepo()
        val changeDir = writeChange(
            repo, "bridge-change",
            mapOf(
                "brainstorm.md" to "raw\n",
                "proposal.md" to "## Why\n",
                "plan.md" to "plan\n",
                "verify.md" to "verify\n",
                "retrospective.md" to "retro\n",
            ),
        )
        val arts = ArtifactDiscovery.discover(repo.absolutePath, changeDir, "bridge-change", noOrder)
        val ids = arts.map { it.id }
        for (id in listOf("brainstorm", "proposal", "plan", "verify", "retrospective")) {
            assertTrue(ids.contains(id), "expected $id to be discovered")
        }
        val retro = arts.first { it.id == "retrospective" }
        assertEquals("Retrospective", retro.title)
        assertEquals("markdown", retro.kind)
    }

    @Test
    fun authoritativeOrderReordersToMatchProvider() {
        val repo = mkRepo()
        val changeDir = writeChange(
            repo, "bridge-change",
            mapOf(
                "brainstorm.md" to "raw\n",
                "proposal.md" to "## Why\n",
                "plan.md" to "plan\n",
                "specs/foo/spec.md" to "## ADDED Requirements\n",
                "scratch.md" to "unmatched\n",
            ),
        )
        val provider = orderOf(
            SchemaArtifactRef("brainstorm", "brainstorm.md"),
            SchemaArtifactRef("proposal", "proposal.md"),
            SchemaArtifactRef("specs", "specs/**/*.md"),
            SchemaArtifactRef("plan", "plan.md"),
        )
        val arts = ArtifactDiscovery.discover(repo.absolutePath, changeDir, "bridge-change", provider)
        assertEquals(listOf("brainstorm", "proposal", "specs", "plan", "scratch"), arts.map { it.id })
        assertEquals("specs", arts[2].kind)
    }

    @Test
    fun ignoresDotfilesAndNonMarkdown() {
        val repo = mkRepo()
        val changeDir = writeChange(
            repo, "c",
            mapOf(
                "proposal.md" to "## Why\n",
                ".openspec.yaml" to "schema: spec-driven\n",
                "notes.txt" to "ignore me\n",
            ),
        )
        val arts = ArtifactDiscovery.discover(repo.absolutePath, changeDir, "c", noOrder)
        assertEquals(listOf("proposal"), arts.map { it.id })
    }

    @Test
    fun countsRootMarkdownPlusSpecs() {
        val repo = mkRepo()
        val changeDir = writeChange(
            repo, "c",
            mapOf(
                "proposal.md" to "x\n",
                "design.md" to "x\n",
                "tasks.md" to "x\n",
                "specs/foo/spec.md" to "x\n",
                ".openspec.yaml" to "schema: spec-driven\n",
                "notes.txt" to "x\n",
            ),
        )
        assertEquals(4, ArtifactDiscovery.count(changeDir))
    }

    @Test
    fun providerNotConsultedWhenSlugAbsent() {
        val repo = mkRepo()
        val changeDir = writeChange(repo, "c", mapOf("proposal.md" to "x\n", "brainstorm.md" to "y\n"))
        var called = 0
        val provider = SchemaOrderProvider { _, _ ->
            called += 1
            listOf(SchemaArtifactRef("brainstorm", "brainstorm.md"))
        }
        val arts = ArtifactDiscovery.discover(repo.absolutePath, changeDir, null, provider)
        assertEquals(0, called)
        assertEquals(listOf("proposal", "brainstorm"), arts.map { it.id })
    }

    @Test
    fun parseOrderFromStatusExtractsOrderedRefs() {
        val refs = SchemaOrder.parseOrderFromStatus(
            """
            {
              "actionContext": { "planningArtifacts": ["brainstorm", "proposal", "specs"] },
              "artifactPaths": {
                "brainstorm": { "outputPath": "brainstorm.md" },
                "proposal": { "outputPath": "proposal.md" },
                "specs": { "outputPath": "specs/**/*.md" }
              }
            }
            """.trimIndent(),
        )
        assertEquals(
            listOf(
                SchemaArtifactRef("brainstorm", "brainstorm.md"),
                SchemaArtifactRef("proposal", "proposal.md"),
                SchemaArtifactRef("specs", "specs/**/*.md"),
            ),
            refs,
        )
    }

    @Test
    fun parseOrderFromStatusReturnsNullForMalformed() {
        assertNull(SchemaOrder.parseOrderFromStatus("not json"))
        assertNull(SchemaOrder.parseOrderFromStatus("{}"))
        assertNull(
            SchemaOrder.parseOrderFromStatus(
                """{ "actionContext": { "planningArtifacts": [] }, "artifactPaths": {} }""",
            ),
        )
    }
}
