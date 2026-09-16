// ICS — Immortal Cursed Spirit
// Clean feature template for Blockbench.
// Toolbox tools + collapsible Tools-menu hierarchy.

(function () {
    'use strict';

    const VERSION = '0.4.0';
    const PLUGIN_ID = 'ics';
    const TOOLBAR_ID = 'main_tools';
    const MENU_ID = 'ics_feature_menu';

    const tools = [];
    const actions = [];

    function safeDelete(item) {
        try {
            if (item && typeof item.delete === 'function') item.delete();
        } catch (error) {
            console.warn('[ICS] Cleanup failed:', error);
        }
    }

    function removeMenuHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;
            menu.structure = (menu.structure || []).filter(item => {
                if (!item) return true;
                return item.id !== MENU_ID && !String(item.id || '').startsWith('ics_');
            });
            menu.update?.(true);
        } catch (error) {
            console.warn('[ICS] Menu cleanup failed:', error);
        }
    }

    function returnToMoveTool() {
        try {
            if (typeof BarItems !== 'undefined' && BarItems.move_tool?.select) {
                BarItems.move_tool.select();
            }
        } catch (error) {}
    }

    function createFeature(id, name, icon, handler) {
        const tool = new Tool(id, {
            name,
            icon,
            category: 'tools',
            toolbar: TOOLBAR_ID,
            transformerMode: 'hidden',
            modes: ['edit', 'paint', 'display', 'animate', 'pose'],
            onSelect() {
                try {
                    handler?.();
                } catch (error) {
                    console.error('[ICS] Feature failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
                returnToMoveTool();
            }
        });

        tools.push(tool);
        return tool;
    }

    function createFeatureAction(id, name, icon, handler) {
        const action = new Action(id, {
            name,
            icon,
            click() {
                try {
                    handler?.();
                } catch (error) {
                    console.error('[ICS] Feature action failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
            }
        });

        actions.push(action);
        return action;
    }

    function buildHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;

            removeMenuHierarchy();

            const children = actions.slice();
            menu.structure.push({
                id: MENU_ID,
                name: 'ICS',
                icon: 'memory',
                children
            });
            menu.update?.(true);
        } catch (error) {
            console.warn('[ICS] Hierarchy build failed:', error);
        }
    }

    function cleanup() {
        removeMenuHierarchy();

        while (actions.length) safeDelete(actions.pop());
        while (tools.length) safeDelete(tools.pop());

        returnToMoveTool();
    }

    Plugin.register(PLUGIN_ID, {
        title: 'ICS — Immortal Cursed Spirit',
        author: 'TFO',
        description: '',
        about: '',
        version: VERSION,
        icon: 'memory',
        variant: 'both',
        min_version: '4.0.0',

        onload() {
            // ------------------------------------------------------------
            // FEATURE TEMPLATE
            // ------------------------------------------------------------
            // Add a feature here with createFeature(...).
            // Add the matching Tools-menu entry with createFeatureAction(...).
            // Both are deleted automatically by cleanup().
            //
            // Example shape:
            //
            // createFeature('ics_feature_example', 'ICS Feature Example', 'memory', () => {
            //     // feature code goes here
            // });
            //
            // createFeatureAction('ics_feature_example_action', 'ICS Feature Example', 'memory', () => {
            //     // feature code goes here
            // });
            //
            // ------------------------------------------------------------

            Blockbench.showQuickMessage('ICS v' + VERSION + ' template loaded');
        },

        oninstall() {},

        onuninstall() {
            this.onunload();
        },

        onunload() {
            cleanup();
        }
    });
})();
