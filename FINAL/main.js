import { Player } from "./player.js";
import { Inputhandler } from "./input.js";
import { Background } from "./background.js";
import { ClimbingEnemy, FlyingEnemy } from "./enemies.js";
import { UI } from "./ui.js";
import { Neeli } from "./neeli.js";

window.addEventListener("load", function () {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 1400;
  canvas.height = 650;

  class Game {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.groundmargin = 90;
      this.speed = 0;
      this.maxspeed = 3;

      this.background = new Background(this);
      this.player = new Player(this);
      this.neeli = new Neeli(this);

      this.input = new Inputhandler(this);
      this.ui = new UI(this);
      this.enemies = [];
      this.particles = [];
      this.collisions = [];
      this.maxparticles = 50;

      this.enemytimer = 0;
      this.enemyinterval = 800; // quick enemies
      this.debug = 0;
      this.score = 0;

      this.gameover = false;

      this.player.currentstate = this.player.states[0];
      this.player.currentstate.enter();
    }

    update(deltatime) {
      if (this.gameover) return;

      this.background.update();
      this.player.update(this.input.keys, deltatime);
      this.neeli.update(deltatime);

      // spawn enemies
      if (this.enemytimer > this.enemyinterval) {
        this.addEnemy();
        this.enemytimer = 0;
      } else {
        this.enemytimer += deltatime;
      }

      // update enemies
      this.enemies.forEach((enemy) => {
        enemy.update(deltatime);
        if (enemy.markfordeletion)
          this.enemies.splice(this.enemies.indexOf(enemy), 1);
      });

      // update particles
      this.particles.forEach((particles, index) => {
        particles.update();
        if (particles.markfordeletion) this.particles.splice(index, 1);
      });
      if (this.particles.length > this.maxparticles) {
        this.particles = this.particles.splice(0, this.maxparticles);
      }

      // update collisions
      this.collisions.forEach((collision, index) => {
        collision.update(deltatime);
        if (collision.markfordeletion) this.collisions.splice(index, 1);
      });
    }

    draw(context) {
      this.background.draw(context);
      this.player.draw(context);
      this.neeli.draw(context);
      this.enemies.forEach((enemy) => enemy.draw(context));
      this.particles.forEach((p) => p.draw(context));
      this.collisions.forEach((c) => c.draw(context));
      this.ui.draw(context);

      if (this.gameover) {
        context.fillStyle = "rgba(0,0,0,0.5)";
        context.fillRect(0, 0, this.width, this.height);

        context.fillStyle = "white";
        context.font = "64px Arial";
        context.textAlign = "center";
        context.fillText("GAME OVER", this.width / 2, this.height / 2 - 20);
        context.font = "28px Arial";
        context.fillText(
          "Press Enter or Click to Restart",
          this.width / 2,
          this.height / 2 + 40
        );
      }
    }

    addEnemy() {
      if (this.speed > 0 && Math.random() < 0.5)
        this.enemies.push(new FlyingEnemy(this));
      else if (this.speed > 0) this.enemies.push(new ClimbingEnemy(this));

      this.enemies.push(new FlyingEnemy(this));
    }
  }

  let game = new Game(canvas.width, canvas.height);
  let lasttime = 0;

  function animate(timeStamp) {
    const deltatime = timeStamp - lasttime;
    lasttime = timeStamp;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    game.update(deltatime);
    game.draw(ctx);

    requestAnimationFrame(animate);
  }

  animate(0);

  // Restart game on Enter key or click
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && game.gameover) {
      game = new Game(canvas.width, canvas.height);
    }
  });

  canvas.addEventListener("click", () => {
    if (game.gameover) {
      game = new Game(canvas.width, canvas.height);
    }
  });
});
