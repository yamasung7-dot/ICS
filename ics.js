// ICS — Immortal Cursed Spirit
// First DODFP experiment: 3D scene -> offscreen 2D texture -> normal Blockbench output.
// UI direction: dark, technical, restrained cursed-spirit creator aesthetic.

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
				experimental offscreen buffer deliberately small for mobile.
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

	function openCreator() {
		new Dialog({
			id: 'ics_creator',
			title: 'ICS — Cursed Spirit Creator',
			width: 430,
			darken: true,
			form: {
				identity: {
					type: 'info',
					text: '**IMMORTAL CURSED SPIRIT**\n\nDODFP laboratory interface. Spatial data enters the renderer, becomes image-space data, and is kept ready for the next experiment.'
				},
				state: {
					type: 'info',
					text: `**Probe status:** ${installed ? 'CONNECTED' : 'DORMANT'}`
				},
				enable: {
					type: 'checkbox',
					label: 'Enable DODFP probe',
					description: 'Runs the experimental offscreen render while preserving Blockbench\'s visible render.',
					value: installed
				},
				buffer: {
					type: 'info',
					text: `**2D buffer:** ${TARGET_SIZE} × ${TARGET_SIZE} RGBA · depth enabled`
				},
				warning: {
					type: 'info',
					text: '*Experimental specimen. Small buffers are intentional for Android/mobile stability.*'
				}
			},
			buttons: ['Apply', 'Cancel'],
			onConfirm(form) {
				if (form.enable) {
					if (!installed) install();
				} else if (installed) {
					uninstall();
				}
			}
		}).show();
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

	const creatorAction = new Action('ics_cursed_spirit_creator', {
		name: 'ICS: Cursed Spirit Creator',
		icon: 'auto_fix_high',
		click: openCreator
	});

	Plugin.register('ics', {
		title: 'ICS — Immortal Cursed Spirit',
		author: 'TFO',
		description: 'Experimental DODFP rendering bridge for Blockbench.',
		about: 'A dark, technical creator interface for the ICS DODFP experiments. The first experiment traces a real Blockbench WebGLRenderer through an offscreen WebGLRenderTarget while preserving the normal visible render.',
		version: '0.2.0',
		icon: 'memory',
		variant: 'both',
		min_version: '4.0.0',
		onload() {
			MenuBar.view.addAction(creatorAction);
			MenuBar.view.addAction(action);
		},
		onunload() {
			uninstall();
			creatorAction.delete();
			action.delete();
		}
	});
})();
