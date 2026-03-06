import { Database } from "bun:sqlite";

import type { Episode } from "../../core/domain/episode.ts";
import type { FSRSCard } from "../../core/domain/fsrs.ts";
import type { SemanticFact } from "../../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../../core/domain/types.ts";
import type { StoragePort } from "../../ports/storage.ts";
import type { EpisodeRow, FactRow, MessageRow } from "./sqlite-rows.ts";
import { escapeLike, rowToEpisode, rowToFact, rowToMessage } from "./sqlite-rows.ts";

/** SQLite storage adapter using bun:sqlite */
export class SQLiteStorageAdapter implements StoragePort {
	private db: Database;

	constructor(path = ":memory:") {
		this.db = new Database(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA foreign_keys = ON");
		this.createTables();
	}

	close(): void {
		this.db.close();
	}

	private createTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS episodes (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				title TEXT NOT NULL,
				summary TEXT NOT NULL,
				messages TEXT NOT NULL,
				embedding TEXT NOT NULL,
				surprise REAL NOT NULL,
				stability REAL NOT NULL,
				difficulty REAL NOT NULL,
				start_at INTEGER NOT NULL,
				end_at INTEGER NOT NULL,
				created_at INTEGER NOT NULL,
				last_reviewed_at INTEGER,
				consolidated_at INTEGER
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_user_id ON episodes(user_id)`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS semantic_facts (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				category TEXT NOT NULL,
				fact TEXT NOT NULL,
				keywords TEXT NOT NULL,
				source_episodic_ids TEXT NOT NULL,
				embedding TEXT NOT NULL,
				valid_at INTEGER NOT NULL,
				invalid_at INTEGER,
				created_at INTEGER NOT NULL
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_facts_user_id ON semantic_facts(user_id)`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS message_queue (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				timestamp INTEGER
			)
		`);
		this.db.exec(`CREATE INDEX IF NOT EXISTS idx_mq_user_id ON message_queue(user_id)`);
	}

	async saveEpisode(userId: string, episode: Episode): Promise<void> {
		if (episode.userId !== userId) {
			throw new Error("episode.userId does not match userId");
		}
		this.db
			.prepare(
				`INSERT INTO episodes (id, user_id, title, summary, messages, embedding, surprise, stability, difficulty, start_at, end_at, created_at, last_reviewed_at, consolidated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				episode.id,
				episode.userId,
				episode.title,
				episode.summary,
				JSON.stringify(episode.messages),
				JSON.stringify(episode.embedding),
				episode.surprise,
				episode.stability,
				episode.difficulty,
				episode.startAt.getTime(),
				episode.endAt.getTime(),
				episode.createdAt.getTime(),
				episode.lastReviewedAt?.getTime() ?? null,
				episode.consolidatedAt?.getTime() ?? null,
			);
	}

	async getEpisodes(userId: string): Promise<Episode[]> {
		const rows = this.db
			.prepare("SELECT * FROM episodes WHERE user_id = ?")
			.all(userId) as EpisodeRow[];
		return rows.map((r) => rowToEpisode(r));
	}

	async getEpisodeById(userId: string, episodeId: string): Promise<Episode | null> {
		const row = this.db
			.prepare("SELECT * FROM episodes WHERE id = ? AND user_id = ?")
			.get(episodeId, userId) as EpisodeRow | null;
		return row ? rowToEpisode(row) : null;
	}

	async getUnconsolidatedEpisodes(userId: string): Promise<Episode[]> {
		const rows = this.db
			.prepare("SELECT * FROM episodes WHERE user_id = ? AND consolidated_at IS NULL")
			.all(userId) as EpisodeRow[];
		return rows.map((r) => rowToEpisode(r));
	}

	async updateEpisodeFSRS(userId: string, episodeId: string, card: FSRSCard): Promise<void> {
		this.db
			.prepare(
				"UPDATE episodes SET stability = ?, difficulty = ?, last_reviewed_at = ? WHERE id = ? AND user_id = ?",
			)
			.run(
				card.stability,
				card.difficulty,
				card.lastReviewedAt?.getTime() ?? null,
				episodeId,
				userId,
			);
	}

	async markEpisodeConsolidated(userId: string, episodeId: string): Promise<void> {
		this.db
			.prepare("UPDATE episodes SET consolidated_at = ? WHERE id = ? AND user_id = ?")
			.run(Date.now(), episodeId, userId);
	}

	async saveFact(userId: string, fact: SemanticFact): Promise<void> {
		if (fact.userId !== userId) {
			throw new Error("fact.userId does not match userId");
		}
		this.db
			.prepare(
				`INSERT INTO semantic_facts (id, user_id, category, fact, keywords, source_episodic_ids, embedding, valid_at, invalid_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				fact.id,
				fact.userId,
				fact.category,
				fact.fact,
				JSON.stringify(fact.keywords),
				JSON.stringify(fact.sourceEpisodicIds),
				JSON.stringify(fact.embedding),
				fact.validAt.getTime(),
				fact.invalidAt?.getTime() ?? null,
				fact.createdAt.getTime(),
			);
	}

	async getFacts(userId: string): Promise<SemanticFact[]> {
		const rows = this.db
			.prepare("SELECT * FROM semantic_facts WHERE user_id = ? AND invalid_at IS NULL")
			.all(userId) as FactRow[];
		return rows.map((r) => rowToFact(r));
	}

	async getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]> {
		const rows = this.db
			.prepare(
				"SELECT * FROM semantic_facts WHERE user_id = ? AND category = ? AND invalid_at IS NULL",
			)
			.all(userId, category) as FactRow[];
		return rows.map((r) => rowToFact(r));
	}

	async invalidateFact(userId: string, factId: string, invalidAt: Date): Promise<void> {
		this.db
			.prepare("UPDATE semantic_facts SET invalid_at = ? WHERE id = ? AND user_id = ?")
			.run(invalidAt.getTime(), factId, userId);
	}

	async updateFact(
		userId: string,
		factId: string,
		updates: Partial<Omit<SemanticFact, "id" | "userId">>,
	): Promise<void> {
		const row = this.db
			.prepare("SELECT * FROM semantic_facts WHERE id = ? AND user_id = ?")
			.get(factId, userId) as FactRow | null;
		if (!row) {
			return;
		}

		const original = rowToFact(row);
		const merged = { ...original, ...updates, id: original.id, userId: original.userId };
		this.db
			.prepare(
				`UPDATE semantic_facts SET user_id = ?, category = ?, fact = ?, keywords = ?, source_episodic_ids = ?, embedding = ?, valid_at = ?, invalid_at = ?, created_at = ? WHERE id = ? AND user_id = ?`,
			)
			.run(
				merged.userId,
				merged.category,
				merged.fact,
				JSON.stringify(merged.keywords),
				JSON.stringify(merged.sourceEpisodicIds),
				JSON.stringify(merged.embedding),
				merged.validAt.getTime(),
				merged.invalidAt?.getTime() ?? null,
				merged.createdAt.getTime(),
				factId,
				userId,
			);
	}

	async pushMessage(userId: string, message: ChatMessage): Promise<void> {
		this.db
			.prepare("INSERT INTO message_queue (user_id, role, content, timestamp) VALUES (?, ?, ?, ?)")
			.run(userId, message.role, message.content, message.timestamp?.getTime() ?? null);
	}

	async getMessageQueue(userId: string): Promise<ChatMessage[]> {
		const rows = this.db
			.prepare(
				"SELECT role, content, timestamp FROM message_queue WHERE user_id = ? ORDER BY id ASC",
			)
			.all(userId) as MessageRow[];
		return rows.map((r) => rowToMessage(r));
	}

	async clearMessageQueue(userId: string): Promise<void> {
		this.db.prepare("DELETE FROM message_queue WHERE user_id = ?").run(userId);
	}

	async searchEpisodes(userId: string, query: string, limit: number): Promise<Episode[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		const pattern = `%${escapeLike(query)}%`;
		const rows = this.db
			.prepare(
				`SELECT * FROM episodes WHERE user_id = ? AND (title LIKE ? ESCAPE '\\' COLLATE NOCASE OR summary LIKE ? ESCAPE '\\' COLLATE NOCASE) LIMIT ?`,
			)
			.all(userId, pattern, pattern, safeLim) as EpisodeRow[];
		return rows.map((r) => rowToEpisode(r));
	}

	async searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		const pattern = `%${escapeLike(query)}%`;
		const rows = this.db
			.prepare(
				`SELECT * FROM semantic_facts WHERE user_id = ? AND invalid_at IS NULL AND (fact LIKE ? ESCAPE '\\' COLLATE NOCASE OR keywords LIKE ? ESCAPE '\\' COLLATE NOCASE) LIMIT ?`,
			)
			.all(userId, pattern, pattern, safeLim) as FactRow[];
		return rows.map((r) => rowToFact(r));
	}
}
