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

/*
 * Run direction is kept separate from the concept itself.
 *
 * This lets the same concept behave differently to the left,
 * middle, or right without multiplying the number of concepts.
 *
 * Direction is optional on OffensivePlayConcept while the
 * realism layer is being integrated so existing call sites and
 * older simulation paths remain safe. Undefined direction is
 * treated as MIDDLE by the execution helpers.
 */
export type RunDirection =
	| "LEFT"
	| "MIDDLE"
	| "RIGHT";

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
			direction?: RunDirection;
	  }
	| {
			type: "pass";
			concept: PassConcept;
	  };

/*
 * Defensive play concepts.
 *
 * Unlike offensive concepts, these are not tagged as a known
 * run or pass response. The defense chooses from this list
 * using information it could reasonably have before the snap:
 *
 * - down
 * - distance
 * - field position
 * - offensive personnel
 * - defensive personnel/roster strengths
 *
 * The defensive call therefore represents an actual pre-snap
 * decision rather than knowledge of what the offense selected.
 *
 * BASE
 *   Balanced call with no strong gamble.
 *
 * MAN_PRESS
 *   Aggressive man coverage near the line of scrimmage.
 *
 * COVER_1
 *   Man coverage with a single high safety.
 *
 * COVER_2
 *   Two-deep shell designed to limit vertical outside throws.
 *
 * COVER_3
 *   Three-deep zone with strong deep-field structure.
 *
 * COVER_4
 *   Four-deep shell that sacrifices underneath/run support
 *   for protection against explosive passes.
 *
 * BLITZ
 *   Extra pass rushers. More pressure and sacks, but fewer
 *   defenders available in coverage.
 *
 * RUN_BLITZ
 *   Aggressive downhill run fit. Strong against interior
 *   rushing but vulnerable to play action and misdirection.
 *
 * EDGE_CONTAIN
 *   Keeps defenders disciplined on the perimeter. Useful
 *   against option football, outside runs, jet action, and
 *   mobile quarterbacks.
 */
export type DefensivePlayConcept =
	| "BASE"
	| "MAN_PRESS"
	| "COVER_1"
	| "COVER_2"
	| "COVER_3"
	| "COVER_4"
	| "BLITZ"
	| "RUN_BLITZ"
	| "EDGE_CONTAIN";

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