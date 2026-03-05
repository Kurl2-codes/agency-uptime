<template>
    <div class="status-widget-card" :class="[$root.theme, overallStatusClass]">
        <div class="status-content">
            <div class="status-indicator">
                <div class="pulsing-dot"></div>
            </div>
            <div class="status-text">
                <h1 class="status-title">{{ statusTitle }}</h1>
                <p class="status-uptime" v-if="uptime !== null">{{ $t("Uptime") }}: {{ uptime }}%</p>
            </div>
        </div>
        <div class="widget-footer">
            <span class="powered-by">Powered by Agency</span>
            <span class="last-updated">{{ lastUpdated }}</span>
        </div>
    </div>
</template>

<script>
import axios from "axios";
import dayjs from "dayjs";
import { STATUS_PAGE_ALL_DOWN, STATUS_PAGE_ALL_UP, STATUS_PAGE_MAINTENANCE, STATUS_PAGE_PARTIAL_DOWN, UP, MAINTENANCE } from "../util.ts";

export default {
    data() {
        return {
            slug: "default",
            config: {},
            loading: true,
            heartbeatList: {},
            lastUpdateTime: dayjs(),
        };
    },
    computed: {
        overallStatus() {
            if (Object.keys(this.heartbeatList).length === 0) {
                return -1;
            }

            let status = STATUS_PAGE_ALL_UP;
            let hasUp = false;

            for (let id in this.heartbeatList) {
                let list = this.heartbeatList[id];
                if (list.length === 0) continue;
                
                let beat = list[list.length - 1]; // Latest beat

                if (beat.status === MAINTENANCE) {
                    return STATUS_PAGE_MAINTENANCE;
                } else if (beat.status === UP) {
                    hasUp = true;
                } else {
                    status = STATUS_PAGE_PARTIAL_DOWN;
                }
            }

            if (!hasUp) {
                status = STATUS_PAGE_ALL_DOWN;
            }

            return status;
        },
        overallStatusClass() {
             if (this.overallStatus === STATUS_PAGE_ALL_UP) return "status-up";
             if (this.overallStatus === STATUS_PAGE_PARTIAL_DOWN) return "status-warning";
             if (this.overallStatus === STATUS_PAGE_ALL_DOWN) return "status-danger";
             if (this.overallStatus === STATUS_PAGE_MAINTENANCE) return "status-maintenance";
             return "status-unknown";
        },
        statusTitle() {
             if (this.overallStatus === STATUS_PAGE_ALL_UP) return this.$t("All Systems Operational");
             if (this.overallStatus === STATUS_PAGE_PARTIAL_DOWN) return this.$t("Partially Degraded Service");
             if (this.overallStatus === STATUS_PAGE_ALL_DOWN) return this.$t("Degraded Service");
             if (this.overallStatus === STATUS_PAGE_MAINTENANCE) return this.$t("Under Maintenance");
             return this.$t("Loading Status...");
        },
        uptime() {
            // Placeholder: Calculate average uptime from this.$root.uptimeList if available, or just hide it for now
            // To keep it simple, we won't compute global average yet unless requested.
            return "99.99"; 
        },
        lastUpdated() {
            return dayjs(this.lastUpdateTime).format("HH:mm");
        }
    },
    mounted() {
        this.slug = this.$route.params.slug || "default";
        this.fetchData();
        
        // Refresh every 60s
        setInterval(this.fetchData, 60000);
    },
    methods: {
        async fetchData() {
            try {
                // We need heartbeat data to determine status
                const res = await axios.get("/api/status-page/heartbeat/" + this.slug);
                this.heartbeatList = res.data.heartbeatList;
                this.lastUpdateTime = dayjs();
            } catch (e) {
                console.error(e);
            }
        }
    }
}
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.status-widget-card {
    background-color: var(--bs-body-bg, #fff);
    color: var(--bs-body-color, #000);
    font-family: 'Inter', sans-serif;
    padding: 24px;
    height: 100vh; /* Occupy full iframe */
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-sizing: border-box;
    overflow: hidden;

    .dark & {
        background-color: $obsidian-blue;
        color: white;
    }
    // Status Colors
    &.status-up { 
        --status-color: #{$status-up}; 
    }
    &.status-warning { 
        --status-color: #{$warning}; 
    }
    &.status-danger { 
        --status-color: #{$danger}; 
    }
    &.status-maintenance { 
        --status-color: #{$maintenance}; 
    }
    &.status-unknown { 
        --status-color: #{$light-grey}; 
    }
}

.status-content {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-grow: 1;
}

.status-indicator {
    position: relative;
    width: 24px;
    height: 24px;
    
    .pulsing-dot {
        width: 16px;
        height: 16px;
        background-color: var(--status-color);
        border-radius: 50%;
        position: absolute;
        top: 4px;
        left: 4px;
        box-shadow: 0 0 0 0 rgba(var(--status-color), 0.7);
        animation: pulse 2s infinite;
    }
}

@keyframes pulse {
    0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); // White glow
    }
    70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
    }
    100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
    }
}

.status-text {
    .status-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        line-height: 1.2;
    }
    .status-uptime {
        font-size: 12px;
        color: $light-grey;
        margin: 4px 0 0 0;
        opacity: 0.8;
    }
}

.widget-footer {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 12px;
    margin-top: 12px;
    font-size: 10px;
    color: $light-grey;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    
    .powered-by {
        font-weight: 500;
    }
}
</style>
