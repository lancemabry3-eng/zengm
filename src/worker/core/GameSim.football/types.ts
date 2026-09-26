import type { PlayerInjury } from "../../../common/types.ts";
import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";

export type CompositeRating =
	| "passingAccuracy"
	| "passingDeep"
	| "passingVision"
	| "athleticism"
	| "rushing"
	| "catching"
	| "gettingOpen"
	| "passBlocking"
	| "runBlocking"
	| "passRushing"
	| "runStopping"
	| "passCoverage"
	| "tackling"
	| "avoidingSacks"
	| "ballSecurity"
	| "endurance";

export type PenaltyPlayType =
	| "beforeSnap"
	| "kickoffReturn"
	| "fieldGoal"
	| "punt"
	| "puntReturn"
	| "pass"
	| "run";

/*
 * Core offensive play concepts.
 *
 * These are broader than individual named plays.
 * The simulation can use them to alter personnel preference,
 * blocking behavior, ball-carrier selection, target depth,
 * pressure, rushing lanes, and play outcomes without having
 * to simulate every assignment individually.
 *
 * READ_OPTION gives mobile quarterbacks a designed rushing
 * pathway while retaining an RB threat.
 *
 * QB_POWER is a true designed quarterback run.
 *
 * JET_SWEEP intentionally puts a WR into the rushing game.
 */
export type RunConcept =
	| "INSIDE_ZONE"
	| "OUTSIDE_ZONE"
	| "POWER"
	| "COUNTER"
	| "DRAW"
	| "READ_OPTION"
	| "QB_POWER"
	| "JET_SWEEP";

export type PassConcept =
	| "QUICK_GAME"
	| "INTERMEDIATE"
	| "DEEP_SHOT"
	| "PLAY_ACTION"
	| "SCREEN";

/*
 * A normal offensive snap has both a play family and a
 * specific concept.
 *
 * Keeping the family attached makes the object safe to narrow
 * in TypeScript and avoids accidentally using a run concept
 * inside passing logic or vice versa.
 */
export type OffensivePlayConcept =
	| {
			type: "run";
			concept: RunConcept;
	  }
	| {
			type: "pass";
			concept: PassConcept;
	  };

export type PlayerGameSim = {
	id: number;
	name: string;
	age: number;
	pos: string;
	valueNoPot: number;
	stat: any;
	compositeRating: any;
	skills: string[];
	injured: boolean;
	newInjury: boolean;
	injury: PlayerInjury & {
		playingThrough: boolean;
	};
	ptModifier: number;
	ovrs: Record<Position, number>;

	/*
	 * Football functional-role ratings are calculated once
	 * when the player is loaded into the game simulation.
	 *
	 * Keeping these on PlayerGameSim means formation and
	 * personnel logic can select specialized players without
	 * recalculating role formulas on every snap.
	 *
	 * Optional for compatibility with older tests and any
	 * manually constructed PlayerGameSim objects.
	 */
	roleOvrs?: Partial<
		Record<FunctionalRole, number>
	>;

	seasonStats: Record<string, number>;
};

export type PlayersOnField = Partial<
	Record<Position, PlayerGameSim[]>
>;

export type TeamGameSim = {
	id: number;
	pace: number;
	stat: any;
	player: PlayerGameSim[];
	compositeRating: any;
	depth: Record<Position, PlayerGameSim[]>;
};

/*
 * Offensive personnel follows standard football notation.
 *
 * First digit = running backs
 * Second digit = tight ends
 *
 * The remaining eligible skill players are wide receivers.
 *
 * 11 = 1 RB, 1 TE, 3 WR
 * 12 = 1 RB, 2 TE, 2 WR
 * 21 = 2 RB, 1 TE, 2 WR
 * 22 = 2 RB, 2 TE, 1 WR
 */
export type OffensivePersonnel =
	| "11"
	| "12"
	| "21"
	| "22";

/*
 * Defensive fronts identify the actual structure of
 * the defensive personnel package.
 *
 * These control which functional DL, LB, CB, and safety
 * roles are selected for each snap.
 */
export type DefensiveFront =
	| "NICKEL_4_2"
	| "BASE_3_4"
	| "BASE_4_3";

export type Formation = {
	off: Partial<Record<Position, number>>;
	def: Partial<Record<Position, number>>;

	/*
	 * Normal offensive formations can identify their
	 * personnel grouping.
	 *
	 * Special-teams formations may omit this.
	 */
	offensivePersonnel?: OffensivePersonnel;

	/*
	 * Normal defensive formations can identify their
	 * defensive front.
	 *
	 * Special-teams formations may omit this.
	 */
	defensiveFront?: DefensiveFront;
};