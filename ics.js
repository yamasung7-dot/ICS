// ICS — Immortal Cursed Spirit
// Mobile optimization feature + clean feature template for Blockbench.
// Toolbox tool + collapsible Tools-menu hierarchy.

(function () {
    'use strict';

    const VERSION = '0.5.0';
    const PLUGIN_ID = 'ics';
    const TOOLBAR_ID = 'main_tools';
    const MENU_ID = 'ics_feature_menu';
    const MOBILE_OPTIMIZER_ID = 'ics_mobile_optimizer';
    const MOBILE_OPTIMIZER_ACTION_ID = 'ics_mobile_optimizer_action';

    const tools = [];
    const actions = [];
    const originalPixelRatios = new Map();
    let mobileOptimizationEnabled = false;

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

    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;

        try {
            const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
                ? Preview.all
                : [];

            for (const preview of previews) {
                const renderer = preview?.renderer;
                if (!renderer || typeof renderer.setPixelRatio !== 'function') continue;

                if (mobileOptimizationEnabled) {
                    if (!originalPixelRatios.has(renderer)) {
                        const ratio = typeof renderer.getPixelRatio === 'function'
                            ? renderer.getPixelRatio()
                            : (window.devicePixelRatio || 1);
                        originalPixelRatios.set(renderer, ratio);
                    }
                    renderer.setPixelRatio(1);
                } else if (originalPixelRatios.has(renderer)) {
                    renderer.setPixelRatio(originalPixelRatios.get(renderer));
                }
            }
        } catch (error) {
            console.warn('[ICS] Mobile optimization failed:', error);
        }

        const state = mobileOptimizationEnabled ? 'ON' : 'OFF';
        Blockbench.showQuickMessage('ICS Mobile Optimization: ' + state);
    }

    function toggleMobileOptimization() {
        setMobileOptimization(!mobileOptimizationEnabled);
    }

    function buildHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;

            removeMenuHierarchy();

            menu.structure.push({
                id: MENU_ID,
                name: 'ICS',
                icon: 'memory',
                children: actions.slice()
            });
            menu.update?.(true);
        } catch (error) {
            console.warn('[ICS] Hierarchy build failed:', error);
        }
    }

    function cleanup() {
        setMobileOptimization(false);
        originalPixelRatios.clear();
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
            // FEATURE 01 — MOBILE OPTIMIZATION
            // ------------------------------------------------------------
            // Lowers preview renderer pixel density to 1x while enabled.
            // This reduces GPU pixel workload on phones/tablets without
            // changing model geometry, textures, materials, or PBR data.
            // Turning it off restores each renderer's previous ratio.
            // ------------------------------------------------------------

            createFeature(
                MOBILE_OPTIMIZER_ID,
                'Mobile Optimization',
                'speed',
                toggleMobileOptimization
            );

            createFeatureAction(
                MOBILE_OPTIMIZER_ACTION_ID,
                'Mobile Optimization',
                'speed',
                toggleMobileOptimization
            );

            buildHierarchy();

            Blockbench.showQuickMessage('ICS v' + VERSION + ' loaded');
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
