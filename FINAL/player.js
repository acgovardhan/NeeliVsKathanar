import { Sitting } from "./playerstate.js";
import { Jumping } from "./playerstate.js";
import { Running } from "./playerstate.js";
import { Falling } from "./playerstate.js";
import { Rolling } from "./playerstate.js";
import { Diving } from "./playerstate.js";
import { HIT } from "./playerstate.js";
import { CollisionAnimation } from "./collisionanimation.js";

export class Player {
  constructor(game) {
    this.game = game;
    this.width = 100.5;
    this.height = 91.3;
    this.x = 0;
    this.y = this.game.height - this.height - this.game.groundmargin;
    this.vy = 0;
    this.framex = 0;
    this.framey = 0;
    this.maxframe;
    this.fps = 20;
    this.frameinterval = 1000 / this.fps;
    this.frametimer = 0;

    this.baseSpeed = 2.5;    // normal forward speed
    this.speed = this.baseSpeed;
    this.maxspeed = 12;
    this.weight = 1;

    this.slowTimer = 0;       // slowdown counter
    this.slowDuration = 800;  // slowdown lasts 0.8s

    this.image = document.getElementById("player");

    this.states = [
      new Sitting(this.game),
      new Running(this.game),
      new Jumping(this.game),
      new Falling(this.game),
      new Rolling(this.game),
      new Diving(this.game),      
      new HIT(this.game)
    ];
  }

  update(input, deltatime) {
    this.checkcollision();
    this.currentstate.handleinput(input);

    // Apply slowdown if timer active
    if (this.slowTimer > 0) {
      this.speed = this.baseSpeed / 2;
      this.slowTimer -= deltatime;
    } else {
      this.speed = this.baseSpeed;
    }

    // Boost if right key pressed
    if (input.indexOf("ArrowRight") > -1 && this.currentstate !== this.states[6]) {
      this.speed = this.maxspeed;
    }

    // Move backward if left key pressed
    if (input.indexOf("ArrowLeft") > -1 && this.currentstate !== this.states[6]) {
      this.speed = -this.baseSpeed;
    }

    // Jump
    if (input.indexOf("ArrowUp") > -1 && this.onground()) {
      this.vy = -30;
    }

    // Apply horizontal movement
    this.x += this.speed;

    // Keep inside canvas
    if (this.x < 0) this.x = 0;
    if (this.x > this.game.width - this.width) this.x = this.game.width - this.width;

    // Vertical movement
    this.y += this.vy;
    if (!this.onground()) this.vy += this.weight;
    else this.vy = 0;

    // Prevent falling below ground
    if (this.y > this.game.height - this.height - this.game.groundmargin)
      this.y = this.game.height - this.height - this.game.groundmargin;

    // Sprite animation
    if (this.frametimer > this.frameinterval) {
      this.frametimer = 0;
      if (this.framex < this.maxframe) this.framex++;
      else this.framex = 0;
    } else {
      this.frametimer += deltatime;
    }
  }

  draw(context) {
    if (this.game.debug) {
      context.strokeRect(this.x, this.y, this.width, this.height);
    }
    context.drawImage(this.image, this.x, this.y, this.width, this.height);
  }

  onground() {
    return this.y >= this.game.height - this.height - this.game.groundmargin;
  }

  setState(state, speed) {
    this.currentstate = this.states[state];
    this.game.speed = this.game.maxspeed * speed;
    this.currentstate.enter();
  }

  checkcollision() {
  this.game.enemies.forEach((enemy) => {
    if (
      enemy.x < this.x + this.width &&
      enemy.x + enemy.width > this.x &&
      enemy.y < this.y + this.height &&
      enemy.y + enemy.height > this.y
    ) {
      // Mark enemy for deletion
      enemy.markfordeletion = true;

      // Add collision animation
      this.game.collisions.push(
        new CollisionAnimation(
          this.game,
          enemy.x + enemy.width * 0.5,
          enemy.y + enemy.height * 0.5
        )
      );

      // Increment score for hitting enemy
      this.game.score++;

      // Trigger slowdown instead of game over
      this.slowTimer = this.slowDuration;
    }
  });
}

}
