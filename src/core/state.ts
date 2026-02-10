import type { GameState } from "../types";

type Listener = (nextState: GameState, prevState: GameState) => void;

export class GameStateMachine {
  private state: GameState = "boot";
  private readonly listeners = new Set<Listener>();

  get current(): GameState {
    return this.state;
  }

  set(nextState: GameState): void {
    if (nextState === this.state) {
      return;
    }
    const previous = this.state;
    this.state = nextState;
    this.listeners.forEach((listener) => listener(nextState, previous));
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
