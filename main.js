window.onload = () => {
  const W = 900, H = 420;

  function sceneLog(scene, msg) {
    if (scene.debugMode) console.log('[GAME]', msg);
  }

  function initGameParams(scene) {
    scene.baseWizardSpeed = 220;
    scene.wizardSpeed = scene.baseWizardSpeed;
    scene.minWizardSpeed = 80;
    scene.ghostSpeed = 150;
    scene.slowAmount = 120;
    scene.slowDuration = 900;
    scene.spawnInterval = 1400;
    scene.jumpVelocity = -540; // slightly higher jump
    scene.slideDuration = 500;

    scene.wizardScreenX = 140;
    scene.wizardWorldX = 0;
    scene.ghostWorldX = 600;
    scene.consecutiveAvoids = 0;
    scene.pairs = {};
    scene.nextPairId = 0;
    scene.isSliding = false;
    scene.slowing = false;
    scene.gameOverFlag = false;

    scene.debugMode = false;
  }

  function preloadAssets(scene) {
    scene.load.image('forest', 'backforest.png');
    scene.load.image('vine', 'vine.png');
    scene.load.image('hole', 'holepic.png');
    scene.load.image('floor', 'floorpic.png');
    scene.load.image('neeli', 'neeli.png');
    scene.load.image('kathanar', 'kathnarpic.png');
    scene.load.image('vinetop', 'vinetop-pic.png');
  }

  function generatePlaceholderTextures(scene) {
    const g = scene.add.graphics();
    g.fillStyle(0x00cc66, 1).fillRect(0,0,40,60);
    g.generateTexture('wiz', 40,60);
    g.clear();
  }

  function createBackground(scene, W, H) {
    scene.bg = scene.add.image(0,0,'forest').setOrigin(0,0);
    scene.bg.displayWidth = W;
    scene.bg.displayHeight = H;
  }

  function createGround(scene, W, H) {
    const groundY = H - 60;
    const ground = scene.add.image(W / 2, H, 'floor');
    ground.setOrigin(0.5, 1);
    scene.physics.add.existing(ground, true);
    scene.groundY = groundY;
    return ground;
  }

  // 🔥 Wizard now always big and visible
  function createWizard(scene) {
    scene.wizard = scene.physics.add.sprite(scene.wizardScreenX, scene.groundY, 'kathanar');
    scene.wizard.setOrigin(0.5, 1); // anchor at feet

    // scale wizard so height is ~120px (much larger than before)
    const desiredHeight = 120;
    const scale = desiredHeight / scene.wizard.displayHeight;
    scene.wizard.setScale(scale);

    // set collision box relative to sprite size
    const bw = scene.wizard.displayWidth * 0.6;
    const bh = scene.wizard.displayHeight * 0.9;
    scene.wizard.body.setSize(bw, bh);
    scene.wizard.body.setOffset((scene.wizard.displayWidth - bw) / 2, scene.wizard.displayHeight - bh);

    scene.wizard.body.setCollideWorldBounds(true);
    scene.wizard.body.setImmovable(true);
    scene.wizard.body.setMaxVelocity(999, 1200);

    // set default Y based on sprite height
    scene.wizardDefaultY = scene.groundY;
    scene.wizard.y = scene.wizardDefaultY;
  }

  function createGhost(scene) {
    scene.ghost = scene.physics.add.sprite(
      scene.wizardScreenX + (scene.ghostWorldX - scene.wizardWorldX),
      scene.groundY - 30,
      'neeli'
    );
    scene.ghost.setScale(0.6); // scaled down
    scene.ghost.body.setAllowGravity(false);
    scene.ghost.setAlpha(0.9);
  }

  function createObstaclesGroup(scene) {
    scene.obstacles = scene.physics.add.group({ allowGravity:false, immovable:true });
  }

  function setupInput(scene) {
    scene.cursors = scene.input.keyboard.addKeys({
      up1: Phaser.Input.Keyboard.KeyCodes.W,
      up2: Phaser.Input.Keyboard.KeyCodes.UP,
      down1: Phaser.Input.Keyboard.KeyCodes.S,
      down2: Phaser.Input.Keyboard.KeyCodes.DOWN,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
  }

  function createUI(scene) {
    scene.infoTxt = scene.add.text(12, 10,
      'Controls: Jump (W/UP/Space) — Slide (S/DOWN).\nEnter hole by pressing DOWN while overlapping it.',
      { font: '14px monospace', fill: '#ffffff' });
    scene.distanceTxt = scene.add.text(12, 80, '', { font: '16px monospace', fill: '#ffee66' });
  }

  function startSpawning(scene) {
    stopSpawning(scene);
    scene.spawnTimer = scene.time.addEvent({
      delay: scene.spawnInterval,
      callback: () => spawnPair(scene),
      loop: true
    });
  }

  function stopSpawning(scene) {
    if (scene.spawnTimer) {
      scene.spawnTimer.remove(false);
      scene.spawnTimer = null;
    }
  }

  // ---------------- Obstacle & Hole spawn ----------------
  function spawnPair(scene) {
    const id = scene.nextPairId++;
    const spawnX = scene.game.config.width + 80;

    const topY = 0;
    const bottomY = scene.groundY;

    const topChance = 0.33;
    const bottomChance = 0.33;
    const holeChance = 0.34;

    let hasTop = Math.random() < topChance;
    let hasBottom = Math.random() < bottomChance;

    if (!hasTop && !hasBottom) {
      if (Math.random() < 0.5) hasTop = true; else hasBottom = true;
    }

    let top = null;
    let bottom = null;

    if (hasTop) {
      top = scene.obstacles.create(spawnX, topY, 'vine');
      top.setOrigin(0.5,0);
      top.setScale(0.35);
      top.flipY = true;
      top.body.setAllowGravity(false);
      top.body.setImmovable(true);
      top.setData('pairId', id);
      top.setData('isTop', true);
      scene.physics.add.collider(scene.wizard, top, (wiz, vine) => handleHit(scene, vine));
    }

    if (hasBottom) {
      const bottomIsHole = Math.random() < holeChance;
      if (bottomIsHole) {
        bottom = scene.physics.add.sprite(spawnX, bottomY, 'hole');
        bottom.setOrigin(0.5, 1);
        bottom.setScale(0.5); 
        bottom.body.setAllowGravity(false);
        bottom.body.setImmovable(true);
        bottom.setData('isHole', true);
        bottom.setData('pairId', id);
        bottom.setData('isTop', false);
      } else {
        bottom = scene.obstacles.create(spawnX, bottomY, 'vinetop');
        bottom.setOrigin(0.5,1);
        bottom.setScale(0.35); 
        bottom.body.setAllowGravity(false);
        bottom.body.setImmovable(true);
        bottom.setData('pairId', id);
        bottom.setData('isTop', false);
        scene.physics.add.collider(scene.wizard, bottom, (wiz, vine) => handleHit(scene, vine));
      }
    }

    scene.pairs[id] = {
      top: top,
      bottom: bottom,
      isHole: !!(bottom && bottom.getData && bottom.getData('isHole')),
      collided: false,
      passed: false
    };

    if (top && top.body) top.body.setVelocityX(-scene.wizardSpeed);
    if (bottom && bottom.body) bottom.body.setVelocityX(-scene.wizardSpeed);

    sceneLog(scene, `spawnPair id=${id} hole=${!!(bottom && bottom.getData && bottom.getData('isHole'))}`);
  }

  // ---------------- Collisions & Effects ----------------
  function handleHoleEnter(scene, pairId) {
    const pair = scene.pairs[pairId];
    if (!pair || pair.collided) return;
    pair.collided = true;

    scene.consecutiveAvoids = 0;
    scene.infoTxt.setText('Dropped into hole — wizard slowed!');

    if (!scene.slowing) {
      scene.slowing = true;
      scene.wizardSpeed = Math.max(scene.minWizardSpeed, scene.wizardSpeed - scene.slowAmount);
      scene.cameras.main.shake(120, 0.005);
      scene.wizard.setTint(0xff7744);

      const dropDepth = 42;
      scene.tweens.add({
        targets: scene.wizard,
        y: scene.wizard.y + dropDepth,
        duration: 160,
        ease: 'Power2',
        onComplete: () => {
          scene.time.delayedCall(260, () => {
            scene.tweens.add({ targets: scene.wizard, y: scene.wizardDefaultY, duration: 220, ease: 'Power2' });
          });
        }
      });

      scene.time.delayedCall(scene.slowDuration + 300, () => {
        scene.wizardSpeed = scene.baseWizardSpeed;
        scene.wizard.clearTint();
        scene.slowing = false;
      });
    }
  }

  function handleHit(scene, obstacle) {
    const pid = obstacle.getData('pairId');
    if (pid == null) return;
    const pair = scene.pairs[pid];
    if (!pair || pair.collided) return;
    pair.collided = true;

    scene.consecutiveAvoids = 0;
    scene.infoTxt.setText('Hit! Wizard slowed.');

    if (!scene.slowing) {
      scene.slowing = true;
      scene.wizardSpeed = Math.max(scene.minWizardSpeed, scene.wizardSpeed - scene.slowAmount);
      scene.cameras.main.shake(120, 0.005);
      scene.wizard.setTint(0xff7744);
      scene.tweens.add({ targets: scene.wizard, y: scene.wizardDefaultY, duration: 200, ease: 'Power2' });

      scene.time.delayedCall(scene.slowDuration, () => {
        scene.wizardSpeed = scene.baseWizardSpeed;
        scene.wizard.clearTint();
        scene.slowing = false;
      });
    }
  }

  function startSlide(scene) {
    scene.isSliding = true;
    const bw = scene.wizard.displayWidth * 0.6;
    const bh = scene.wizard.displayHeight * 0.4; // half-height
    scene.wizard.body.setSize(bw, bh);
    scene.wizard.body.setOffset((scene.wizard.displayWidth - bw) / 2, scene.wizard.displayHeight - bh);
    scene.wizard.setScale(scene.wizard.scaleX, scene.wizard.scaleY * 0.5);
    scene.time.delayedCall(scene.slideDuration, () => {
      if (!scene.gameOverFlag) endSlide(scene);
    });
  }

  function endSlide(scene) {
    scene.isSliding = false;
    const bw = scene.wizard.displayWidth * 0.6;
    const bh = scene.wizard.displayHeight * 0.9;
    scene.wizard.body.setSize(bw, bh);
    scene.wizard.body.setOffset((scene.wizard.displayWidth - bw) / 2, scene.wizard.displayHeight - bh);
    scene.wizard.setScale(scene.wizard.scaleX, scene.wizard.scaleY * (120 / scene.wizard.displayHeight));
  }

  function checkPairs(scene) {
    for (const id in scene.pairs) {
      const pair = scene.pairs[id];
      if (!pair) continue;
      if (!pair.passed) {
        const topRight = pair.top ? (pair.top.x + pair.top.displayWidth / 2) : -9999;
        const bottomRight = pair.bottom ? (pair.bottom.x + pair.bottom.displayWidth / 2) : -9999;
        const topPassed = pair.top ? (topRight < scene.wizard.x) : true;
        const bottomPassed = pair.bottom ? (bottomRight < scene.wizard.x) : true;

        if (topPassed && bottomPassed) {
          pair.passed = true;
          if (!pair.collided) {
            scene.consecutiveAvoids++;
            if (scene.consecutiveAvoids >= 3) {
              doGameOver(scene, 'Wizard avoided two pairs — he caught the ghost!');
              return;
            }
          } else {
            scene.consecutiveAvoids = 0;
          }
        }
      }

      const topGone = !pair.top || (pair.top.x < -220);
      const bottomGone = !pair.bottom || (pair.bottom.x < -220);
      if (topGone && bottomGone) {
        if (pair.top) pair.top.destroy();
        if (pair.bottom) pair.bottom.destroy();
        delete scene.pairs[id];
      }
    }
  }

  function updateWorld(scene, delta) {
    const dt = delta / 1000;
    scene.wizardWorldX += scene.wizardSpeed * dt;
    scene.ghostWorldX += scene.ghostSpeed * dt;

    const gap = scene.ghostWorldX - scene.wizardWorldX;
    const ghostScreenX = scene.wizardScreenX + gap;
    scene.ghost.x = Phaser.Math.Clamp(ghostScreenX, scene.wizardScreenX + 40, scene.game.config.width - 80);

    for (const id in scene.pairs) {
      const pair = scene.pairs[id];
      if (pair.top && pair.top.body) pair.top.body.setVelocityX(-scene.wizardSpeed);
      if (pair.bottom && pair.bottom.body) pair.bottom.body.setVelocityX(-scene.wizardSpeed);
    }

    const dist = Math.max(0, Math.round(scene.ghostWorldX - scene.wizardWorldX));
    scene.distanceTxt.setText(`Distance (ghost ahead): ${dist} px\nWizard speed: ${Math.round(scene.wizardSpeed)} px/s`);
  }

  function doGameOver(scene, reason) {
    if (scene.gameOverFlag) return;
    scene.gameOverFlag = true;
    scene.infoTxt.setText(`GAME OVER: ${reason}\nClick/tap to restart`);
    scene.cameras.main.flash(300,255,0,0);
    stopSpawning(scene);

    for (const id in scene.pairs) {
      const pair = scene.pairs[id];
      if (pair.top && pair.top.body) pair.top.body.setVelocityX(0);
      if (pair.bottom && pair.bottom.body) pair.bottom.body.setVelocityX(0);
    }

    if (scene.wizard && scene.wizard.body) scene.wizard.body.enable = false;
  }

  function restartGame(scene) {
    window.location.reload();
  }

  // ---------------- Phaser scene ----------------
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
    scene: {
      preload: function() {
        initGameParams(this);
        preloadAssets(this);
      },
      create: function() {
        const scene = this;

        generatePlaceholderTextures(scene);
        createBackground(scene, W, H);
        const ground = createGround(scene, W, H);

        createWizard(scene); // 👈 now big and visible
        createGhost(scene);
        createObstaclesGroup(scene);

        scene.physics.add.collider(scene.wizard, ground);

        setupInput(scene);
        createUI(scene);

        startSpawning(scene);

        scene.input.on('pointerdown', () => {
          if (scene.gameOverFlag) restartGame(scene);
        });
      },
      update: function(time, delta) {
        const scene = this;
        if (scene.gameOverFlag) return;

        const justUp = Phaser.Input.Keyboard.JustDown(scene.cursors.up1) ||
                       Phaser.Input.Keyboard.JustDown(scene.cursors.up2) ||
                       Phaser.Input.Keyboard.JustDown(scene.cursors.space);
        if (justUp && scene.wizard.body.blocked.down) {
          scene.wizard.setVelocityY(scene.jumpVelocity);
          if (scene.isSliding) endSlide(scene);
        }

        const justDown = Phaser.Input.Keyboard.JustDown(scene.cursors.down1) ||
                         Phaser.Input.Keyboard.JustDown(scene.cursors.down2);
        if (justDown && scene.wizard.body.blocked.down) {
          let holeTriggered = false;
          for (const id in scene.pairs) {
            const pair = scene.pairs[id];
            if (pair.isHole && !pair.collided && pair.bottom) {
              const wizBounds = scene.wizard.getBounds();
              const holeBounds = pair.bottom.getBounds();
              if (Phaser.Geom.Intersects.RectangleToRectangle(wizBounds, holeBounds)) {
                handleHoleEnter(scene, parseInt(id,10));
                holeTriggered = true;
                break;
              }
            }
          }
          if (!holeTriggered && !scene.isSliding) startSlide(scene);
        }

        updateWorld(scene, delta);
        checkPairs(scene);

        if (scene.wizardWorldX >= scene.ghostWorldX) {
          doGameOver(scene, 'Wizard caught the ghost!');
        }
      }
    }
  };

  new Phaser.Game(config);
};
