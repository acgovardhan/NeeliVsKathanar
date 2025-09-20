window.onload = () => {
  const container = document.getElementById('game-container');
  const BASE_W = container?.clientWidth || 900;
  const BASE_H = container?.clientHeight || 420;

  const T = {
    wizardHeightFrac: 0.28,
    ghostRelativeToWizard: 2.2,
    wizardScreenXFrac: 0.14,
    baseWizardSpeedPerSec: 220,
    minWizardSpeedPerSec: 80,
    baseGhostSpeedPerSec: 150,
    slowAmountBase: 120,
    slowDurationMs: 900,
    slideDurationMs: 450,
    jumpVelocityBase: -520,
    spawnIntervalMin: 700,
    spawnIntervalMax: 1600,
    topChance: 0.45,
    bottomChance: 0.65,
    holeChance: 0.28,
    movingVineChance: 0.35,
    doubleObstacleChance: 0.15,
    speedDriftPerSec: 2.5,
    consecutiveAvoidsToWin: 3,
    difficultyScaleRate: 0.00025 // how fast difficulty scales
  };

  const sceneLog = (scene, msg) => { if (scene.debugMode) console.log('[GAME]', msg); };

  function initGameParams(scene) {
    const W = scene.scale.width, H = scene.scale.height;
    const scaleFactor = H / BASE_H;

    scene.baseWizardSpeed = T.baseWizardSpeedPerSec * scaleFactor;
    scene.wizardSpeed = scene.baseWizardSpeed;
    scene.minWizardSpeed = T.minWizardSpeedPerSec * scaleFactor;
    scene.ghostSpeed = T.baseGhostSpeedPerSec * scaleFactor;
    scene.slowAmount = Math.round(T.slowAmountBase * scaleFactor);
    scene.slowDuration = T.slowDurationMs;
    scene.slideDuration = T.slideDurationMs;
    scene.jumpVelocity = T.jumpVelocityBase * scaleFactor;

    scene.wizardScreenX = Math.round(W * T.wizardScreenXFrac);
    scene.wizardWorldX = 0;
    scene.ghostWorldX = scene.wizardWorldX + Math.round(W * 0.85);

    scene.pairs = {};
    scene.nextPairId = 0;
    scene.isSliding = false;
    scene.slowing = false;
    scene.gameOverFlag = false;
    scene.powerActive = false;
    scene.debugMode = false;

    scene.spawnTimer = null;
    scene.comboHits = 0; // track successful hits
    scene.elapsedTime = 0; // total time for difficulty scaling
    scene.misses = 0;
  }

  function preloadAssets(scene) {
    scene.load.image('forest', 'backforest.png');
    scene.load.image('vine', 'vine.png');
    scene.load.image('hole', 'holepic.png');
    scene.load.image('floor', 'floorpic.png');
    scene.load.image('neeli', 'neeli.png');
    scene.load.image('kathanar', 'kathnarpic.png');
    scene.load.image('vinetop', 'vinetop-pic.png');
    scene.load.image('ghostball', 'ghost-ball.png');
  }

  function generatePlaceholderTextures(scene) {
    if (!scene.textures.exists('wiz')) {
      const g = scene.add.graphics();
      g.fillStyle(0x00cc66, 1).fillRect(0,0,40,60);
      g.generateTexture('wiz', 40,60);
      g.destroy();
    }
  }

  function createBackground(scene) {
    const W = scene.scale.width, H = scene.scale.height;
    scene.bg = scene.add.image(0,0,'forest').setOrigin(0,0);
    scene.bg.displayWidth = W;
    scene.bg.displayHeight = H;
  }

  function createGround(scene) {
    const W = scene.scale.width, H = scene.scale.height;
    const groundY = H - Math.round(H * 0.10);
    const ground = scene.add.image(W/2, H, 'floor').setOrigin(0.5, 1);
    scene.physics.add.existing(ground, true);
    scene.groundY = groundY;
    return ground;
  }

  function createWizard(scene) {
    const H = scene.scale.height;
    scene.wizard = scene.physics.add.sprite(0,0,'kathanar').setOrigin(0.5,1);
    const desiredHeight = Math.round(H * T.wizardHeightFrac);
    const baseImg = scene.textures.get('kathanar').getSourceImage();
    const scale = desiredHeight / (baseImg ? baseImg.height : 180);
    scene.wizard.setScale(scale);
    scene._origWizardScale = { x: scene.wizard.scaleX, y: scene.wizard.scaleY };

    scene.wizard.body.setAllowGravity(true);
    const bw = scene.wizard.displayWidth * 0.56;
    const bh = scene.wizard.displayHeight * 0.9;
    scene.wizard.body.setSize(bw, bh);
    scene.wizard.body.setOffset((scene.wizard.displayWidth - bw)/2, scene.wizard.displayHeight - bh);

    scene.wizard.body.setCollideWorldBounds(true);
    scene.wizard.body.setMaxVelocity(9999, 3000);

    const liftFraction = 0.12;
    scene.wizardDefaultY = scene.groundY - Math.round(scene.wizard.displayHeight * liftFraction);
    scene.wizard.setPosition(scene.wizardScreenX, scene.wizardDefaultY);
  }

  function createGhost(scene) {
    const H = scene.scale.height;
    const ghostY = scene.groundY - Math.round(H * 0.14);
    scene.ghost = scene.physics.add.sprite(scene.wizardScreenX + (scene.ghostWorldX - scene.wizardWorldX), ghostY, 'neeli');
    const ghostScale = Math.max(0.8, scene._origWizardScale.y * T.ghostRelativeToWizard);
    scene.ghost.setScale(ghostScale);
    scene.ghost.body.setAllowGravity(false);
    scene.ghost.setAlpha(0.98);
    scene.ghostBalls = scene.physics.add.group({ allowGravity:false });
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
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      power: Phaser.Input.Keyboard.KeyCodes.K
    });
  }

  function createUI(scene) {
    const H = scene.scale.height;
    scene.infoTxt = scene.add.text(12, 8, 'Jump: W/UP/Space • Slide/Down: S/DOWN • Ghost attack: K', { font: `${Math.round(H*0.026)}px monospace`, fill: '#fff' });
    scene.distanceTxt = scene.add.text(12, Math.round(H*0.10), '', { font: `${Math.round(H*0.032)}px monospace`, fill: '#ffea66' });
  }

  function scheduleNextSpawn(scene) {
    const delay = Phaser.Math.Between(T.spawnIntervalMin, T.spawnIntervalMax);
    scene.time.delayedCall(delay, () => {
      spawnPair(scene);

      if (!scene.gameOverFlag) scheduleNextSpawn(scene);
    });
  }

 function spawnPair(scene) {
    const id = scene.nextPairId++;
    const W = scene.scale.width;
    const spawnX = W + Phaser.Math.Between(Math.round(W*0.05), Math.round(W*0.12)); // random horizontal offset

    const elapsed = scene.elapsedTime;
    const topChance = Phaser.Math.Clamp(T.topChance + elapsed*T.difficultyScaleRate, 0.3, 0.85);
    const bottomChance = Phaser.Math.Clamp(T.bottomChance + elapsed*T.difficultyScaleRate, 0.4, 0.95);

    const hasTop = Math.random() < topChance;
    const hasBottom = Math.random() < bottomChance;
    let top = null, bottom = null;
    const doubleBottom = !hasTop && hasBottom && (Math.random() < T.doubleObstacleChance);

    // --- Top Vine ---
    if (hasTop) {
        top = scene.obstacles.create(spawnX, 0, 'vine').setOrigin(0.5,1);
        const scale = Phaser.Math.FloatBetween(0.08, 0.22) * (scene.scale.height / BASE_H);
        top.setScale(scale);
        top.flipY = true;
        top.body.setAllowGravity(false);
        top.body.setImmovable(true);
        top.y = Phaser.Math.Between(Math.round(scene.scale.height*0.05), Math.round(scene.scale.height*0.4)); // random vertical
        top.x += Phaser.Math.Between(-Math.round(W*0.05), Math.round(W*0.05));
        top.setData('pairId', id);
        top.setData('isTop', true);
        scene.physics.add.collider(scene.wizard, top, (wiz, vine) => handleHit(scene, vine));

        if (Math.random() < T.movingVineChance) {
            const bob = Phaser.Math.Between(18, 38);
            scene.tweens.add({ targets: top, y: bob, duration: Phaser.Math.Between(900, 1600), yoyo:true, repeat:-1, ease: 'Sine.easeInOut' });
        }
    }

    // --- Bottom Vine / Hole ---
    if (hasBottom) {
        const bottomIsHole = Math.random() < T.holeChance;
        if (bottomIsHole) {
            bottom = scene.physics.add.sprite(spawnX, scene.groundY, 'hole').setOrigin(0.5,1);
            const holeScale = Phaser.Math.FloatBetween(0.4, 0.9) * (scene.scale.height / BASE_H);
            bottom.setScale(holeScale);
            bottom.body.setAllowGravity(false);
            bottom.body.setImmovable(true);
            bottom.setData('isHole', true);
            bottom.setData('pairId', id);
            bottom.setData('isTop', false);
        } else {
            const v = scene.obstacles.create(spawnX, scene.groundY, 'vinetop').setOrigin(0.5,1);
            v.setScale(Phaser.Math.FloatBetween(0.10, 0.36) * (scene.scale.height / BASE_H));
            v.body.setAllowGravity(false);
            v.body.setImmovable(true);
            v.y -= Phaser.Math.Between(Math.round(scene.wizard.displayHeight*0.22), Math.round(scene.wizard.displayHeight*0.5));
            v.x += Phaser.Math.Between(-Math.round(W*0.05), Math.round(W*0.05)); // random horizontal
            v.setData('pairId', id);
            v.setData('isTop', false);
            scene.physics.add.collider(scene.wizard, v, (wiz, vine) => handleHit(scene, vine));
            bottom = v;

            if (doubleBottom && Math.random() < 0.9) {
                const v2 = scene.obstacles.create(spawnX + Math.round(scene.scale.width*0.12), scene.groundY, 'vinetop').setOrigin(0.5,1);
                v2.setScale(Phaser.Math.FloatBetween(0.10, 0.30) * (scene.scale.height / BASE_H));
                v2.body.setAllowGravity(false);
                v2.body.setImmovable(true);
                v2.y -= Phaser.Math.Between(Math.round(scene.wizard.displayHeight*0.18), Math.round(scene.wizard.displayHeight*0.45));
                v2.x += Phaser.Math.Between(-Math.round(W*0.05), Math.round(W*0.05));
                v2.setData('pairId', id);
                v2.setData('isTop', false);
                scene.physics.add.collider(scene.wizard, v2, (wiz, vine) => handleHit(scene, vine));
                bottom = { sprite: v, extra: v2 };
            }
        }
    }

    scene.pairs[id] = {
        top, bottom,
        isHole: !!(bottom && bottom.getData && bottom.getData('isHole')),
        collided: false,
        passed: false
    };

    // Set initial velocity for obstacles (move left at witch speed)
    const setVel = (obj) => { 
        if (!obj) return; 
        if (obj.body) obj.body.setVelocityX(-scene.wizardSpeed); 
        else if (obj.sprite) { 
            obj.sprite.body.setVelocityX(-scene.wizardSpeed); 
            if (obj.extra) obj.extra.body.setVelocityX(-scene.wizardSpeed); 
        }
    };
    setVel(top); 
    setVel(bottom);
}


  // --- Hit / Obstacle Handling ---
  function handleHit(scene, obstacle) {
    const pid = obstacle.getData('pairId');
    if (pid == null) return;
    const pair = scene.pairs[pid];
    if (!pair || pair.collided) return;
    pair.collided = true;

    scene.comboHits++;
    scene.infoTxt.setText(`Obstacle hit! Combo: ${scene.comboHits}`);
    if (!scene.slowing) {
      scene.slowing = true;
      scene.wizardSpeed = Math.max(scene.minWizardSpeed, scene.wizardSpeed - scene.slowAmount);
      scene.cameras.main.shake(120, 0.005);
      scene.wizard.setTint(0xff7744);
      scene.time.delayedCall(scene.slowDuration, () => {
        scene.wizardSpeed = scene.baseWizardSpeed;
        scene.wizard.clearTint();
        scene.slowing = false;
      });
    }
  }

  function updateWorld(scene, delta) {
    const dt = delta/1000;
    scene.elapsedTime += dt;

    // constant ghost speed
    const ghostLeadMin = Math.round(scene.scale.height * 0.18);
    const ghostLeadMax = Math.round(scene.scale.height * 0.28);

    // if witch missed obstacles, ghost lead shrinks
    const gapReduction = scene.misses ? scene.misses * 20 : 0; 
    const targetGhostWorldX = scene.wizardWorldX + ghostLeadMax - gapReduction;

    // move ghost toward target
    if (scene.ghostWorldX < targetGhostWorldX) {
        scene.ghostWorldX += 200 * dt; // uniform ghost speed
    } else {
        scene.ghostWorldX = targetGhostWorldX;
    }

    // move witch forward
    scene.wizardWorldX += scene.wizardSpeed * dt;

    // screen positions
    scene.ghost.x = Phaser.Math.Clamp(scene.wizardScreenX + (scene.ghostWorldX - scene.wizardWorldX),
        scene.wizardScreenX + ghostLeadMin, scene.scale.width - Math.round(scene.scale.width*0.12));

    // move obstacles left
    for (const id in scene.pairs) {
        const pair = scene.pairs[id];
        const setVel = (obj) => { 
            if (!obj) return; 
            if (obj.body) obj.body.setVelocityX(-scene.wizardSpeed); 
            else if (obj.sprite) { 
                obj.sprite.body.setVelocityX(-scene.wizardSpeed); 
                if (obj.extra) obj.extra.body.setVelocityX(-scene.wizardSpeed); 
            }
        };
        setVel(pair.top); setVel(pair.bottom);
    }
}

function handleMiss(scene) {
    scene.misses = (scene.misses || 0) + 1;
    scene.infoTxt.setText(`Missed obstacle! Total misses: ${scene.misses}`);

    // shrink ghost lead gradually
    if (scene.misses >= 3) {
        doGameOver(scene, 'The witch caught the ghost after too many misses!');
    }
}



  function checkPairs(scene) {
  for (const id in scene.pairs) {
    const pair = scene.pairs[id];
    if (!pair) continue;

    if (!pair.passed) {
      const topRight = pair.top ? (pair.top.x + (pair.top.displayWidth/2)) : -9999;
      let bottomRight = -9999;
      if (pair.bottom) {
        if (pair.bottom.sprite) bottomRight = pair.bottom.extra ? (pair.bottom.extra.x + pair.bottom.extra.displayWidth/2) : (pair.bottom.sprite.x + pair.bottom.sprite.displayWidth/2);
        else bottomRight = (pair.bottom.x + (pair.bottom.displayWidth/2));
      }
      const topPassed = pair.top ? (topRight < scene.wizard.x) : true;
      const bottomPassed = pair.bottom ? (bottomRight < scene.wizard.x) : true;

      if (topPassed && bottomPassed) {
      pair.passed = true;
      if (!pair.collided) {
          scene.comboHits++;
      } else {
          scene.comboHits = 0; // reset combo if missed
          handleMiss(scene);  // <-- increment miss counter
      }
    }

    }

    const offscreenLeft = -Math.round(scene.scale.width * 0.5);
    const topGone = !pair.top || (pair.top.x < offscreenLeft);
    const bottomGone = !pair.bottom || ((pair.bottom.sprite ? pair.bottom.sprite.x : pair.bottom.x) < offscreenLeft);
    if (topGone && bottomGone) {
      if (pair.top && pair.top.destroy) pair.top.destroy();
      if (pair.bottom) {
        if (pair.bottom.sprite) { pair.bottom.sprite.destroy(); if (pair.bottom.extra) pair.bottom.extra.destroy(); }
        else if (pair.bottom.destroy) pair.bottom.destroy();
      }
      delete scene.pairs[id];
    }
  }
}


  function doGameOver(scene, reason) {
    if (scene.gameOverFlag) return;
    scene.gameOverFlag = true;
    scene.infoTxt.setText(`GAME OVER: ${reason}\nClick/tap to restart`);
    scene.cameras.main.flash(300,255,0,0);
    for (const id in scene.pairs) {
      const pair = scene.pairs[id];
      const freeze = (o) => { if (!o) return; if (o.body) o.body.setVelocityX(0); else if (o.sprite) { o.sprite.body.setVelocityX(0); if (o.extra) o.extra.setVelocityX(0); }};
      freeze(pair.top); freeze(pair.bottom);
    }
    if (scene.wizard && scene.wizard.body) scene.wizard.body.enable = false;
  }

  function restartGame(scene) { window.location.reload(); }

  const config = {
    type: Phaser.AUTO,
    width: BASE_W,
    height: BASE_H,
    parent: 'game-container',
    backgroundColor: '#0f1020',
    physics: { default: 'arcade', arcade: { gravity: { y: 1200 }, debug: false } },
    scene: {
      preload: function() { initGameParams(this); preloadAssets(this); },
      create: function() {
        const scene = this;
        initGameParams(scene);
        generatePlaceholderTextures(scene);
        createBackground(scene);
        createGround(scene);
        createWizard(scene);
        createGhost(scene);
        createObstaclesGroup(scene);
        scene.physics.add.collider(scene.wizard, scene.physics.world.staticBodies);
        setupInput(scene); createUI(scene);
        scheduleNextSpawn(scene);
        scene.input.on('pointerdown', () => { if (scene.gameOverFlag) restartGame(scene); });
      },
      update: function(time, delta) {
        const scene = this;
        if (scene.gameOverFlag) return;

        const justUp = Phaser.Input.Keyboard.JustDown(scene.cursors.up1) || Phaser.Input.Keyboard.JustDown(scene.cursors.up2) || Phaser.Input.Keyboard.JustDown(scene.cursors.space);
        if (justUp && scene.wizard.body.blocked.down) { scene.wizard.setVelocityY(scene.jumpVelocity); if (scene.isSliding) endSlide(scene); }

        const justDown = Phaser.Input.Keyboard.JustDown(scene.cursors.down1) || Phaser.Input.Keyboard.JustDown(scene.cursors.down2);
        if (justDown && scene.wizard.body.blocked.down) startSlide(scene);
        if ((scene.cursors.down1.isUp && scene.cursors.down2.isUp) && scene.isSliding) endSlide(scene);

        checkPairs(scene);
        updateWorld(scene, delta);

        if (scene.ghost.x <= scene.wizardScreenX + Math.round(scene.scale.height * 0.05)) doGameOver(scene, 'The ghost caught the wizard!');
      }
    }
  };

  new Phaser.Game(config);
};
