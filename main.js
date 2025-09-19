// main.js - Phaser 3 prototype for "Wizard chases ghost"
// Place index.html, main.js and backforest.png in same folder and run via local server.

window.onload = () => {
  const W = 900, H = 420;
  const config = {
    type: Phaser.AUTO,
    width: W,
    height: H,
    parent: 'game-container',
    backgroundColor: '#101018',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 1200 }, debug: false }
    },
    scene: { preload, create, update }
  };

  new Phaser.Game(config);

  function preload() {
    // load your background image (put backforest.png in same folder as index.html)
    this.load.image('forest', 'backforest.png');
    // other assets are generated in create() so nothing else to preload
  }

  function create() {
    const scene = this;

    // ------ Tunable gameplay parameters -------
    scene.baseWizardSpeed = 220;      // pixels per second (the forward "speed" of the wizard)
    scene.wizardSpeed = scene.baseWizardSpeed;
    scene.minWizardSpeed = 80;
    scene.ghostSpeed = 150;           // ghost forward speed (lower than wizard by default)
    scene.slowAmount = 120;           // how much wizard speed drops on hitting an obstacle
    scene.slowDuration = 900;         // ms duration of slow effect
    scene.spawnInterval = 1400;       // ms between obstacle pairs
    scene.jumpVelocity = -520;        // jump impulse
    scene.slideDuration = 500;        // ms slide lasts
    // ------------------------------------------

    scene.wizardScreenX = 140;  // fixed X on screen where wizard is drawn
    scene.wizardWorldX = 0;     // numeric world progress of wizard
    scene.ghostWorldX = 600;    // ghost starts 600 px ahead in world coords

    scene.consecutiveAvoids = 0; // counts passed pairs with NO collision
    scene.pairs = {};           // store obstacle pairs by id
    scene.nextPairId = 0;
    scene.isSliding = false;
    scene.slowing = false;
    scene.gameOverFlag = false;

    // ---- Background (fit to game size) ----
    scene.bg = scene.add.image(0, 0, 'forest').setOrigin(0, 0);
    // ensure background covers the canvas (will stretch)
    scene.bg.displayWidth = W;
    scene.bg.displayHeight = H;

    // Ground
    const groundY = H - 60;
    const ground = this.add.rectangle(W/2, groundY + 30, W, 120, 0x4a3320);
    this.physics.add.existing(ground, true);

    // Generate tiny retro placeholder textures using graphics (so you can run without assets)
    const g = this.add.graphics();
    g.fillStyle(0x00cc66, 1).fillRect(0,0,40,60);          // wizard green block
    g.generateTexture('wiz', 40, 60);
    g.clear();
    g.fillStyle(0xffffff, 1).fillRect(0,0,40,60);          // ghost white block
    g.generateTexture('ghost', 40, 60);
    g.clear();
    g.fillStyle(0x888888, 1).fillRect(0,0,36,90);          // tall obstacle
    g.generateTexture('ob', 36, 90);
    g.destroy();

    // Wizard sprite (physics body)
    scene.wizard = scene.physics.add.sprite(scene.wizardScreenX, groundY - 30, 'wiz');
    scene.wizard.setOrigin(0.5, 0.5);
    scene.wizard.body.setSize(36, 58);
    scene.wizard.body.setCollideWorldBounds(true);
    scene.wizard.body.setImmovable(true); // prevents physics push horizontally
    scene.wizard.body.setMaxVelocity(999, 1200);

    // Ghost sprite (phases through obstacles)
    scene.ghost = scene.physics.add.sprite(scene.wizardScreenX + (scene.ghostWorldX - scene.wizardWorldX), groundY - 30, 'ghost');
    scene.ghost.body.setAllowGravity(false);
    scene.ghost.setAlpha(0.95);

    // Collide wizard with ground
    scene.physics.add.collider(scene.wizard, ground);

    // obstacles group
    scene.obstacles = scene.physics.add.group({ allowGravity: false, immovable: true });

    // Collision detection between wizard and obstacles (physics collider)
    // When wizard physically hits an obstacle, handleHit will run.
    scene.physics.add.collider(scene.wizard, scene.obstacles, (wiz, ob) => {
      handleHit.call(scene, ob);
    });

    // Input
    scene.cursors = scene.input.keyboard.addKeys({
      up1: Phaser.Input.Keyboard.KeyCodes.W,
      up2: Phaser.Input.Keyboard.KeyCodes.UP,
      down1: Phaser.Input.Keyboard.KeyCodes.S,
      down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // Spawn obstacle pairs on timer
    scene.spawnTimer = scene.time.addEvent({
      delay: scene.spawnInterval,
      callback: spawnPair,
      callbackScope: scene,
      loop: true
    });

    // UI text
    scene.infoTxt = scene.add.text(12, 10, 'Make the wizard *hit* obstacles to slow him.\nIf wizard avoids 2 pairs in a row, you lose.', { font: '14px monospace', fill: '#ffffff' });
    scene.distanceTxt = scene.add.text(12, 80, '', { font: '16px monospace', fill: '#ffee66' });

    // small camera shake on hit
    scene.cameras.main.setBackgroundColor('#101018');

    // Restart on click after game over
    scene.input.on('pointerdown', () => {
      if (scene.gameOverFlag) {
        restartGame.call(scene);
      }
    });
  } // end create

  function update(time, delta) {
    const scene = this;
    if (scene.gameOverFlag) return;

    const dt = delta / 1000;

    // Update world positions
    scene.wizardWorldX += scene.wizardSpeed * dt;
    scene.ghostWorldX += scene.ghostSpeed * dt;

    // Ghost screen X is derived from relative world distance to wizard
    const gap = scene.ghostWorldX - scene.wizardWorldX;
    const ghostScreenX = scene.wizardScreenX + gap;
    scene.ghost.x = Phaser.Math.Clamp(ghostScreenX, scene.wizardScreenX + 40, this.game.config.width - 80);

    // If wizard catches ghost (world positions collide) -> game over
    if (scene.wizardWorldX >= scene.ghostWorldX) {
      doGameOver.call(scene, 'Wizard caught the ghost!');
      return;
    }

    // Update obstacles velocity to match current wizardSpeed (so slowing affects movement speed)
    scene.obstacles.getChildren().forEach(ob => {
      ob.body.setVelocityX(-scene.wizardSpeed);
    });

    // Controls: jump (W/UP/Space)
    const justUp = Phaser.Input.Keyboard.JustDown(scene.cursors.up1) || Phaser.Input.Keyboard.JustDown(scene.cursors.up2) || Phaser.Input.Keyboard.JustDown(scene.cursors.space);
    if (justUp && scene.wizard.body.blocked.down) {
      scene.wizard.setVelocityY(scene.jumpVelocity);
      // if sliding, stop slide (jump cancels slide)
      if (scene.isSliding) endSlide.call(scene);
    }

    // Slide (S / DOWN)
    const justDown = Phaser.Input.Keyboard.JustDown(scene.cursors.down1) || Phaser.Input.Keyboard.JustDown(scene.cursors.down2);
    if (justDown && scene.wizard.body.blocked.down && !scene.isSliding) {
      startSlide.call(scene);
    }

    // Pairs: check passing and avoid counting
    for (const id in scene.pairs) {
      const pair = scene.pairs[id];
      if (!pair) continue;
      if (!pair.passed) {
        // Wait for both obstacles to have passed the wizardScreenX
        const rightTop = pair.top.x + pair.top.displayWidth / 2;
        const rightBottom = pair.bottom.x + pair.bottom.displayWidth / 2;
        if (rightTop < scene.wizard.x && rightBottom < scene.wizard.x) {
          pair.passed = true;
          if (!pair.collided) {
            scene.consecutiveAvoids += 1;
            // Show quick UI change
            scene.infoTxt.setText(`Missed an obstacle pair! consecutive misses: ${scene.consecutiveAvoids}\nMake the wizard hit the NEXT obstacle!`);
            // If missed two consecutive pairs => wizard catches ghost (rule)
            if (scene.consecutiveAvoids >= 2) {
              doGameOver.call(scene, 'Wizard avoided two pairs — he caught the ghost!');
              return;
            }
          } else {
            // pair was hit, reset avoid counter
            scene.consecutiveAvoids = 0;
            scene.infoTxt.setText('Good — wizard hit an obstacle (slowed). Keep hitting obstacles to slow him down!');
          }
        }
      }
      // Cleanup fully-offscreen pairs
      if (pair.top.x < -200 && pair.bottom.x < -200) {
        // remove sprites and pair entry
        if (pair.top && pair.top.destroy) pair.top.destroy();
        if (pair.bottom && pair.bottom.destroy) pair.bottom.destroy();
        delete scene.pairs[id];
      }
    }

    // update distance UI
    const dist = Math.max(0, Math.round(scene.ghostWorldX - scene.wizardWorldX));
    scene.distanceTxt.setText(`Distance (ghost ahead): ${dist} px\nWizard speed: ${Math.round(scene.wizardSpeed)} px/s`);

  } // end update

  // ---------- helper functions ----------

  function spawnPair() {
    const scene = this;
    const spawnX = this.game.config.width + 60;
    const topY = 40;                   // top obstacle top position
    const bottomY = this.game.config.height - 70; // bottom obstacle bottom reference

    // create top obstacle (flipped)
    const top = scene.obstacles.create(spawnX, topY, 'ob');
    top.setOrigin(0.5, 0);
    top.flipY = true;
    top.body.setAllowGravity(false);
    top.body.setImmovable(true);

    // create bottom obstacle (on the ground)
    const bottom = scene.obstacles.create(spawnX, bottomY, 'ob');
    bottom.setOrigin(0.5, 1);
    bottom.body.setAllowGravity(false);
    bottom.body.setImmovable(true);

    // pair bookkeeping
    const id = scene.nextPairId++;
    top.setData('pairId', id);
    bottom.setData('pairId', id);
    scene.pairs[id] = { top: top, bottom: bottom, collided: false, passed: false };

    // set initial velocity so obstacles move left at the wizard speed
    top.body.setVelocityX(-scene.wizardSpeed);
    bottom.body.setVelocityX(-scene.wizardSpeed);
  }

  function handleHit(obstacle) {
    // obstacle is either top or bottom; find pair
    const scene = this;
    const pid = obstacle.getData('pairId');
    if (pid === undefined || pid === null) return;
    const pair = scene.pairs[pid];
    if (!pair) return;

    // if already recorded collision for this pair, ignore
    if (pair.collided) return;
    pair.collided = true;

    // reset consecutive avoids
    scene.consecutiveAvoids = 0;

    // apply slow effect (one-at-a-time)
    if (!scene.slowing) {
      scene.slowing = true;
      scene.wizardSpeed = Math.max(scene.minWizardSpeed, scene.wizardSpeed - scene.slowAmount);
      scene.cameras.main.shake(120, 0.005);
      scene.wizard.setTint(0xff7744);
      // restore speed after duration
      scene.time.delayedCall(scene.slowDuration, () => {
        scene.wizardSpeed = scene.baseWizardSpeed;
        scene.wizard.clearTint();
        scene.slowing = false;
      }, [], scene);
    }
  }

  function startSlide() {
    const scene = this;
    scene.isSliding = true;
    // reduce body size to simulate sliding
    const W = scene.wizard.body.width;
    const H = scene.wizard.body.height;
    scene.wizard.body.setSize(W, Math.round(H * 0.55));
    // offset so bottom remains at same ground y
    scene.wizard.body.offset.y = Math.round(H * 0.45);
    // temporary visual
    scene.wizard.setScale(1, 0.65);
    // end slide after duration
    scene.time.delayedCall(scene.slideDuration, () => {
      if (scene && !scene.gameOverFlag) endSlide.call(scene);
    }, [], scene);
  }

  function endSlide() {
    const scene = this;
    scene.isSliding = false;
    // reset body size and offset (to initial)
    scene.wizard.body.setSize(36, 58);
    scene.wizard.body.offset.y = 0;
    scene.wizard.setScale(1,1);
  }

  function doGameOver(reason) {
    const scene = this;
    if (scene.gameOverFlag) return;
    scene.gameOverFlag = true;
    scene.infoTxt.setText(`GAME OVER: ${reason}\nClick/tap to restart`);
    scene.cameras.main.flash(300, 255, 0, 0);
    // freeze obstacles & wizard visually
    if (scene.spawnTimer) scene.spawnTimer.remove(false);
    scene.obstacles.getChildren().forEach(ob => { if (ob.body) ob.body.setVelocityX(0); });
    scene.wizard.body.enable = false;
  }

  function restartGame() {
    const scene = this;
    // simple restart by reloading entire page
    window.location.reload();
  }

}; // window.onload
