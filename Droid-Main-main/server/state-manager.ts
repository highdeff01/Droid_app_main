/**
 * Game State Manager
 * Centralized state management for game automation
 */

interface GameEntity {
  type: "player" | "enemy" | "objective" | "item" | "npc" | "partner";
  name: string;
  position: { x: number; y: number };
  health?: number;
  maxHealth?: number;
  confidence: number;
  timestamp: number;
}

interface GameGoal {
  id: string;
  description: string;
  priority: number;
  status: "pending" | "in_progress" | "completed";
  createdAt: number;
}

interface GameState {
  gamePhase: string;
  playerPosition: { x: number; y: number } | null;
  health: number;
  entities: Map<string, GameEntity>;
  goals: Map<string, GameGoal>;
  patterns: string[];
  imageHash: string;
  lastUpdated: number;
}

/**
 * Centralized, history-tracking store for the current game automation
 * state (entities, goals, player position/health) used to detect changes
 * and drive automation decisions.
 */
class GameStateManager {
  private state: GameState;
  private stateHistory: GameState[] = [];
  private maxHistorySize = 50;

  /** Initializes the manager with a default, empty game state. */
  constructor() {
    this.state = {
      gamePhase: "unknown",
      playerPosition: null,
      health: 100,
      entities: new Map(),
      goals: new Map(),
      patterns: [],
      imageHash: "",
      lastUpdated: Date.now(),
    };
  }

  /**
   * Snapshots the current state into history, applies `updates`, and
   * refreshes derived fields (entities map, player position/health).
   */
  updateState(updates: Partial<GameState>): void {
    // Save current state to history
    this.stateHistory.push({ ...this.state });
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Update state
    Object.assign(this.state, updates);
    this.state.lastUpdated = Date.now();

    // Update entities if provided
    if (updates.entities) {
      this.state.entities.clear();
      updates.entities.forEach((entity: GameEntity) => {
        this.state.entities.set(`${entity.type}_${entity.name}`, entity);
      });
    }

    // Extract player position from entities
    const player = Array.from(this.state.entities.values()).find(
      (e) => e.type === "player",
    );
    if (player) {
      this.state.playerPosition = player.position;
      this.state.health = player.health || this.state.health;
    }
  }

  /** Returns a shallow copy of the current game state. */
  getState(): GameState {
    return { ...this.state };
  }

  /** Returns a copy of the recorded state history. */
  getStateHistory(): GameState[] {
    return [...this.stateHistory];
  }

  /** Adds a new goal, generating its id and creation timestamp. */
  addGoal(goal: Omit<GameGoal, "id" | "createdAt">): string {
    const id = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newGoal: GameGoal = {
      ...goal,
      id,
      createdAt: Date.now(),
    };
    this.state.goals.set(id, newGoal);
    return id;
  }

  /** Merges `updates` into the goal matching `id`; returns false if not found. */
  updateGoal(id: string, updates: Partial<GameGoal>): boolean {
    const goal = this.state.goals.get(id);
    if (goal) {
      Object.assign(goal, updates);
      return true;
    }
    return false;
  }

  /** Removes the goal matching `id`; returns false if it did not exist. */
  removeGoal(id: string): boolean {
    return this.state.goals.delete(id);
  }

  /** Returns all tracked entities of the given type. */
  getEntitiesByType(type: GameEntity["type"]): GameEntity[] {
    return Array.from(this.state.entities.values()).filter(
      (e) => e.type === type,
    );
  }

  /** Returns entities within `radius` pixels of `position`. */
  getNearbyEntities(
    position: { x: number; y: number },
    radius: number,
  ): GameEntity[] {
    return Array.from(this.state.entities.values()).filter((entity) => {
      const dx = entity.position.x - position.x;
      const dy = entity.position.y - position.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }

  /**
   * Returns true if the state appears to have meaningfully changed since
   * the last recorded snapshot (entity count, game phase, or pattern count).
   */
  hasStateChanged(threshold: number = 0.1): boolean {
    if (this.stateHistory.length === 0) return true;

    const previous = this.stateHistory[this.stateHistory.length - 1];
    const current = this.state;

    // Simple change detection based on entity count and positions
    if (previous.entities.size !== current.entities.size) return true;
    if (previous.gamePhase !== current.gamePhase) return true;
    if (previous.patterns.length !== current.patterns.length) return true;

    return false;
  }

  /** Resets the game state and history back to their initial empty values. */
  reset(): void {
    this.state = {
      gamePhase: "unknown",
      playerPosition: null,
      health: 100,
      entities: new Map(),
      goals: new Map(),
      patterns: [],
      imageHash: "",
      lastUpdated: Date.now(),
    };
    this.stateHistory = [];
  }
}

export const gameStateManager = new GameStateManager();
