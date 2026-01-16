const { R } = require("redbean-node");
const { askSREAgent } = require("../socket-handlers/mariadb-report-handler");
const fs = require("fs");
const path = require("path");

class GlobalLatencyManager {
    constructor() {
        if (!GlobalLatencyManager.instance) {
            this.latencyCache = {};
            this.pollingInterval = 30 * 60 * 1000; // 30 minutes
            this.isRunning = false;
            // Store cache in data directory
            this.cachePath = path.join(__dirname, "../../data/latency-cache.json");
            GlobalLatencyManager.instance = this;
        }
        return GlobalLatencyManager.instance;
    }

    /**
     * Start the background polling service
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("[GlobalLatencyManager] Service started.");

        // Load persisted cache immediately on startup
        this.loadCache();

        // Run refresh logic immediately on start (updates any stale entries)
        this.pollAllMonitors();

        // Schedule periodic runs
        setInterval(() => {
            this.pollAllMonitors();
        }, this.pollingInterval);
    }

    /**
     * Load cache from disk
     */
    loadCache() {
        try {
            if (fs.existsSync(this.cachePath)) {
                console.log(`[GlobalLatencyManager] Loading cache from ${this.cachePath}`);
                const data = fs.readFileSync(this.cachePath, "utf-8");
                this.latencyCache = JSON.parse(data);
                console.log(`[GlobalLatencyManager] Loaded ${Object.keys(this.latencyCache).length} entries from disk.`);
            } else {
                console.log("[GlobalLatencyManager] No cache file found. Starting fresh.");
            }
        } catch (e) {
            console.error("[GlobalLatencyManager] Failed to load cache:", e);
        }
    }

    /**
     * Save cache to disk
     */
    saveCache() {
        try {
            // Ensure directory exists (data folder usually exists in Kuma)
            fs.writeFileSync(this.cachePath, JSON.stringify(this.latencyCache, null, 2));
        } catch (e) {
            console.error("[GlobalLatencyManager] Failed to save cache:", e);
        }
    }

    /**
     * Poll all active HTTP monitors for global latency
     */
    async pollAllMonitors() {
        console.log("[GlobalLatencyManager] Starting periodic poll...");
        try {
            // Fetch all active HTTP monitors
            const monitors = await R.getAll("SELECT id, name, url, hostname, type FROM monitor WHERE active = 1 AND type IN ('http', 'keyword')");

            for (const monitor of monitors) {
                const url = monitor.url || monitor.hostname;
                if (!url || !url.startsWith("http")) continue;

                // Check Latency
                await this.refreshLatency(url);

                // Throttle implicitly via await
            }
            console.log("[GlobalLatencyManager] Poll completed.");

        } catch (e) {
            console.error("[GlobalLatencyManager] Poll failed:", e);
        }
    }

    /**
     * Fetch latency for a single URL and update cache
     * @param {string} url 
     */
    async refreshLatency(url) {
        try {
            console.log(`[GlobalLatencyManager] Refreshing for: ${url}`);
            const prompt = `Use the checkGlobalLatency tool to check the latency for ${url}. Return ONLY the JSON object from the tool output. Do not include any other text or markdown formatting.`;

            // Generate a unique request ID
            const reqId = `latency-bg-${Date.now()}`;
            const response = await askSREAgent(prompt, reqId);

            // Robust parsing
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                this.latencyCache[url] = {
                    data: JSON.parse(jsonMatch[0]),
                    timestamp: Date.now()
                };
                // Persist to disk after successful update
                this.saveCache();
            } else {
                console.warn(`[GlobalLatencyManager] Failed to parse JSON for ${url}`);
            }

        } catch (e) {
            console.error(`[GlobalLatencyManager] Failed refresh for ${url}:`, e);
        }
    }

    /**
     * Get cached result
     * @param {string} url 
     * @returns {object|null} Cached data or null
     */
    getCachedResult(url) {
        return this.latencyCache[url] ? this.latencyCache[url].data : null;
    }

    /**
     * Trigger a background refresh for a specific URL (fire and forget)
     * @param {string} url 
     */
    triggerRefresh(url) {
        // Run in background, don't await
        this.refreshLatency(url).catch(e => console.error(e));
    }
}

const instance = new GlobalLatencyManager();
// Export the singleton
module.exports = instance;
