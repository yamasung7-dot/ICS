// ICS — Immortal Cursed Spirit
// First DODFP experiment: 3D scene -> offscreen 2D texture -> normal Blockbench output.

(function () {
	'use strict';

	let installed = false;
	const states = new WeakMap();
	const TARGET_SIZE = 256;

	function getPreviews() {
		return (typeof Preview !== 'undefined' && Array.isArray(Preview.all))
			? Preview.all
			: [];
	}

	function installPreview(preview) {
		if (!preview || !preview.renderer || states.has(preview)) return false;

		const renderer = preview.renderer;
		if (typeof THREE === 'undefined' || !THREE.WebGLRenderTarget) {
			console.error('[ICS] Three.js WebGLRenderTarget is unavailable.');
			return false;
		}

		const target = new THREE.WebGLRenderTarget(TARGET_SIZE, TARGET_SIZE, {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			depthBuffer: true,
			stencilBuffer: false
		});
		target.texture.name = 'ICS_DODFP_Offscreen';

		const originalRender = preview.render.bind(preview);
		const state = { target, originalRender, rendering: false };
		states.set(preview, state);

		preview.render = function () {
			if (state.rendering) return originalRender();
			state.rendering = true;

			try {
				// Preserve the renderer's current size/pixel ratio, but keep the
				// experimental offscreen buffer deliberately small for mobile.
				renderer.setRenderTarget(target);
				renderer.clear();
				renderer.render(Canvas.scene, preview.camera);
				renderer.setRenderTarget(null);

				// The original Blockbench render remains the visible output.
				originalRender();
			} catch (error) {
				console.error('[ICS] DODFP probe failed:', error);
				try { renderer.setRenderTarget(null); } catch (_) {}
				originalRender();
			} finally {
				state.rendering = false;
			}
		};

		console.info('[ICS] DODFP bridge installed:', {
			preview,
			renderer,
			renderTarget: target,
			texture: target.texture
		});
		return true;
	}

	function install() {
		let count = 0;
		getPreviews().forEach(preview => {
			if (installPreview(preview)) count++;
		});
		installed = true;
		Blockbench.showQuickMessage('ICS DODFP probe: ' + count + ' preview(s) connected');
	}

	function uninstall() {
		getPreviews().forEach(preview => {
			const state = states.get(preview);
			if (!state) return;
			preview.render = state.originalRender;
			state.target.dispose();
			states.delete(preview);
		});
		installed = false;
	}

	const action = new Action('ics_dodfp_probe', {
		name: 'ICS: DODFP Probe',
		icon: 'memory',
		click() {
			if (installed) {
				uninstall();
				Blockbench.showQuickMessage('ICS DODFP probe removed');
			} else {
				install();
			}
		}
	});

	Plugin.register('ics', {
		title: 'ICS — Immortal Cursed Spirit',
		author: 'TFO',
		description: 'Experimental DODFP rendering bridge for Blockbench.',
		about: 'The first ICS experiment traces a real Blockbench WebGLRenderer through an offscreen WebGLRenderTarget while preserving the normal visible render. It is intentionally small and mobile-conscious.',
		version: '0.1.0',
		icon: 'memory',
		variant: 'both',
		min_version: '4.0.0',
		onload() {
			MenuBar.view.addAction(action);
		},
		onunload() {
			uninstall();
			action.delete();
		}
	});
})();
