package com.spek.intellij

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.spek.intellij.tree.SpekTreePanel
import javax.swing.JSplitPane
import javax.swing.JPanel
import java.awt.BorderLayout

class SpekToolWindowFactory : ToolWindowFactory, DumbAware {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val basePath = project.basePath ?: return
        val browserPanel = SpekBrowserPanel(project)

        val treePanel = SpekTreePanel(basePath) { path ->
            browserPanel.navigateTo(path)
        }
        browserPanel.onFileChanged = { treePanel.refresh() }

        val splitPane = JSplitPane(JSplitPane.VERTICAL_SPLIT).apply {
            topComponent = treePanel
            bottomComponent = browserPanel.component
            dividerSize = 4
            resizeWeight = 0.3
        }

        val wrapper = JPanel(BorderLayout())
        wrapper.add(splitPane, BorderLayout.CENTER)

        val content = ContentFactory.getInstance().createContent(wrapper, "", false)
        toolWindow.contentManager.addContent(content)
        Disposer.register(content, browserPanel)
    }

    override fun shouldBeAvailable(project: Project): Boolean {
        val basePath = project.basePath ?: return false
        return com.spek.intellij.core.OpenSpecScanner.hasOpenSpec(basePath)
    }
}
