package com.spek.intellij.tree

import com.intellij.openapi.application.ApplicationManager
import com.intellij.ui.treeStructure.Tree
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.tree.DefaultMutableTreeNode

class SpekTreePanel(
    private val projectPath: String,
    private val onNavigate: (path: String) -> Unit,
) : JPanel(BorderLayout()) {

    private val tree: Tree

    init {
        val model = SpekTreeModel.build(projectPath)
        tree = Tree(model)
        tree.isRootVisible = false
        tree.cellRenderer = SpekTreeCellRenderer()

        // 預設展開 Specs 和 Changes 根節點
        for (i in 0 until tree.rowCount) {
            tree.expandRow(i)
        }

        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) {
                    handleDoubleClick()
                }
            }
        })

        add(JScrollPane(tree), BorderLayout.CENTER)
    }

    private fun handleDoubleClick() {
        val selectedNode = tree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return
        val nodeData = selectedNode.userObject as? SpekTreeNode ?: return

        val path = when (nodeData) {
            is SpekTreeNode.SpecItem -> "/specs/${nodeData.spec.topic}"
            is SpekTreeNode.ChangeItem -> "/changes/${nodeData.change.slug}"
            else -> return
        }

        onNavigate(path)
    }

    fun refresh() {
        ApplicationManager.getApplication().executeOnPooledThread {
            val newModel = SpekTreeModel.build(projectPath)
            ApplicationManager.getApplication().invokeLater {
                tree.model = newModel
                // 展開 Specs 和 Changes 根節點
                for (i in 0 until tree.rowCount) {
                    tree.expandRow(i)
                }
            }
        }
    }
}
