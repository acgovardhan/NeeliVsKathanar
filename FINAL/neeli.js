export class Neeli {
  constructor(game) {
    this.game = game;
    this.width = 80;
    this.height = 90;
    this.x = game.width / 3;  // start closer to player
    this.y = game.height - this.height - game.groundmargin;

    this.baseSpeed = 2; // slower than player
    this.speed = this.baseSpeed;

    this.image = document.getElementById("neeli");
    this.markForDeletion = false;
  }

  update(deltatime) {
    this.x += this.speed;

    // Collision with player triggers Game Over
    if (
      this.x < this.game.player.x + this.game.player.width &&
      this.x + this.width > this.game.player.x &&
      this.y < this.game.player.y + this.game.player.height &&
      this.y + this.height > this.game.player.y
    ) {
      this.game.gameover = true;
    }

    if (this.x > this.game.width) this.x = this.game.width - this.width;
  }

  draw(context) {
    context.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
}
