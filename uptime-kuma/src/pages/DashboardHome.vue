<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <h1 class="mb-4">
                {{ $t("Agency Performance") }}
            </h1>

            <!-- 1. Agency Performance Stats -->
            <div class="stats-grid mb-5">
                <div class="stat-card">
                    <h3>{{ $t("Clients") }}</h3>
                    <span class="num">{{ quickStats.groupCount || 0 }}</span>
                </div>
                <div class="stat-card">
                    <h3>{{ $t("Sites Under Monitoring") }}</h3>
                    <span class="num">{{ quickStats.monitorCount }}</span>
                </div>
                <!-- Highlighted Stats with Liquid Lava -->
                <div class="stat-card highlight-card">
                    <h3>{{ $t("Client Uptime") }}</h3>
                    <span class="num lava-text">{{ formatPercentage(quickStats.groupUptime) }}</span>
                </div>
                <div class="stat-card highlight-card">
                    <h3>{{ $t("Agency Performance") }}</h3>
                    <span class="num lava-text">{{ formatPercentage(quickStats.agencyPerformance) }}</span>
                </div>
                <div class="stat-card">
                    <h3>{{ $t("Downtime Resolution") }}</h3>
                    <span class="num">{{ formatDuration(quickStats.mttr) }}</span>
                </div>
            </div>

            <!-- 2. Status Counts -->
            <h4 class="mb-3">{{ $t("Current Status") }}</h4>
            <div class="status-grid mb-5">
                <div class="status-card up">
                    <h3>{{ $t("Up") }}</h3>
                    <span class="num">{{ $root.stats.up }}</span>
                </div>
                <div class="status-card down" :class="{ 'active': $root.stats.down > 0 }">
                    <h3>{{ $t("Down") }}</h3>
                    <span class="num">{{ $root.stats.down }}</span>
                </div>
                <div class="status-card maintenance" :class="{ 'active': $root.stats.maintenance > 0 }">
                    <h3>{{ $t("Maintenance") }}</h3>
                    <span class="num">{{ $root.stats.maintenance }}</span>
                </div>
                <div class="status-card unknown">
                    <h3>{{ $t("Unknown") }}</h3>
                    <span class="num">{{ $root.stats.unknown }}</span>
                </div>
                <div class="status-card pause">
                    <h3>{{ $t("pauseDashboardHome") }}</h3>
                    <span class="num">{{ $root.stats.pause }}</span>
                </div>
            </div>

            <!-- 3. Client Details -->
            <div v-if="quickStats.groupsData && quickStats.groupsData.length > 0" class="mb-5">
                 <h4 class="mb-3">{{ $t("Clients") }} Details</h4>
                 <div class="client-list">
                     <div class="client-card" v-for="group in quickStats.groupsData" :key="group.id">
                        <div @click="toggleGroup(group.id)" class="client-header">
                             <div class="client-info">
                                <span class="client-name">{{ group.name }}</span>
                                 <span class="monitor-badge">{{ group.monitorCount }} monitors</span>
                             </div>
                             <div class="client-summary">
                                <span class="me-3 text-muted">Avg Uptime: <strong class="text-white">{{ formatPercentage(group.uptime) }}</strong></span>
                                <font-awesome-icon icon="angle-down" :rotation="expandedGroups[group.id] ? 180 : 0" class="arrow-icon" />
                             </div>
                        </div>
                        
                        <transition name="slide-fade">
                            <div v-if="expandedGroups[group.id]" class="client-details">
                                 <div class="row text-center">
                                    <div class="col">
                                        <h6>Average Uptime</h6>
                                        <span class="lava-text big-num">{{ formatPercentage(group.uptime) }}</span>
                                    </div>
                                     <div class="col">
                                        <h6>Downtime Resolution (MTTR)</h6>
                                        <span class="lava-text big-num">{{ formatDuration(group.mttr) }}</span>
                                    </div>
                                </div>
                            </div>
                        </transition>
                     </div>
                 </div>
            </div>

            <!-- Events Table -->
            <div class="shadow-box table-shadow-box" style="overflow-x: hidden;">
                <div class="mb-3 text-end">
                    <button
                        class="btn btn-sm btn-outline-primary me-2"
                        @click="$refs.shiftReportDialog.show()"
                    >
                        <font-awesome-icon icon="clipboard" /> {{ $t("Shift Report") }}
                    </button>
                    <button
                        class="btn btn-sm btn-outline-danger"
                        :disabled="clearingAllEvents"
                        @click="clearAllEventsDialog"
                    >
                        {{ $t("Clear All Events") }}
                    </button>
                </div>
                <table class="table table-borderless table-hover">
                    <thead>
                        <tr>
                            <th>{{ $t("Name") }}</th>
                            <th>{{ $t("Status") }}</th>
                            <th>{{ $t("DateTime") }}</th>
                            <th>{{ $t("Message") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(beat, index) in displayedRecords" :key="index" :class="{ 'shadow-box': $root.windowWidth <= 550}">
                            <td class="name-column"><router-link :to="`/dashboard/${beat.monitorID}`">{{ $root.monitorList[beat.monitorID]?.name }}</router-link></td>
                            <td><Status :status="beat.status" /></td>
                            <td :class="{ 'border-0':! beat.msg}"><Datetime :value="beat.time" /></td>
                            <td class="border-0">{{ beat.msg }}</td>
                        </tr>

                        <tr v-if="importantHeartBeatListLength === 0">
                            <td colspan="4">
                                {{ $t("No important events") }}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div class="d-flex justify-content-center kuma_pagination">
                    <pagination
                        v-model="page"
                        :records="importantHeartBeatListLength"
                        :per-page="perPage"
                        :options="paginationConfig"
                    />
                </div>
            </div>
        </div>
    </transition>
    <Confirm ref="confirmClearAll" btn-style="btn-danger" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="clearAllEvents">
        {{ $t("clearAllEventsConfirmation") }}
    </Confirm>

    <ShiftReportDialog ref="shiftReportDialog" />
    <router-view ref="child" />
</template>

<script>
import Status from "../components/Status.vue";
import Datetime from "../components/Datetime.vue";
import Pagination from "v-pagination-3";
import Confirm from "../components/Confirm.vue";
import { timeDurationFormatter } from "../util-frontend";
import StatusList from "../components/StatusList.vue";
import ShiftReportDialog from "../components/ShiftReportDialog.vue";

export default {
    components: {
        Datetime,
        Status,
        Pagination,
        Confirm,
        StatusList,
        ShiftReportDialog,
    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            clearingAllEvents: false,
            quickStats: {
                monitorCount: 0,
                groupCount: 0,
                agencyPerformance: 0,
                groupUptime: 0,
                mttr: 0,
                groupsData: [],
            },
            expandedGroups: {},
        };
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.getImportantHeartbeatListLength();
        this.getQuickStats();

        this.$root.emitter.on("newImportantHeartbeat", this.onNewImportantHeartbeat);

        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        this.$root.emitter.off("newImportantHeartbeat", this.onNewImportantHeartbeat);

        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {
        toggleGroup(groupId) {
            if (this.expandedGroups[groupId]) {
                delete this.expandedGroups[groupId];
            } else {
                this.expandedGroups[groupId] = true;
            }
        },

        formatPercentage(value) {
            return (value * 100).toFixed(2) + "%";
        },

        formatDuration(seconds) {
             const d = Math.floor(seconds / (3600*24));
             const h = Math.floor(seconds % (3600*24) / 3600);
             const m = Math.floor(seconds % 3600 / 60);
             const s = Math.floor(seconds % 60);

             if (d > 0) return d + "d " + h + "h " + m + "m";
             if (h > 0) return h + "h " + m + "m";
             if (m > 0) return m + "m " + s + "s";
             return s + "s";
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },

        clearAllEventsDialog() {
            this.$refs.confirmClearEvents.show();
        },
        clearAllEvents() {
            this.clearingAllEvents = true;
            const monitorIDs = Object.keys(this.$root.monitorList);
            let failed = 0;
            const total = monitorIDs.length;

            if (total === 0) {
                this.clearingAllEvents = false;
                this.$root.toastError(this.$t("No monitors found"));
                return;
            }

            monitorIDs.forEach((monitorID) => {
                this.$root.getSocket().emit("clearEvents", monitorID, (res) => {
                    if (!res || !res.ok) {
                        failed++;
                    }
                });
            });
            this.clearingAllEvents = false;
            this.page = 1;
            this.getImportantHeartbeatListLength();
            if (failed === 0) {
                this.$root.toastSuccess(this.$t("Events cleared successfully"));
            } else {
                this.$root.toastError(
                    this.$t("Could not clear events", {
                        failed,
                        total,
                    })
                );
            }
        },

        getQuickStats() {
            this.$root.getSocket().emit("getQuickStats", (res) => {
                if (res.ok) {
                    this.quickStats = res.data;
                }
            });
        }
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars";

/* Typography Defaults */
h1, h2, h3, h4, h5, h6, .client-name {
    font-family: 'Roboto Slab', serif;
    color: $dark-font-color;
}

body, .num, .client-list, table {
    font-family: 'Inter', sans-serif;
    color: $secondary-text;
}

/* 1. Agency Performance Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
}

.stat-card {
    background-color: $dark-bg2; // White
    padding: 25px;
    border-radius: 16px;
    text-align: center;
    border: 1px solid $dark-border-color;
    box-shadow: 0 4px 6px rgba(0,0,0,0.02);
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;

    &:hover {
        transform: translateY(-3px);
        box-shadow: 0 10px 25px rgba(0,0,0,0.08);
        border-color: rgba($liquid-lava, 0.4);
    }

    h3 {
        font-size: 0.95rem;
        color: $secondary-text;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 15px;
        font-weight: 600;
    }

    .num {
        font-size: 2.2rem;
        font-weight: 700;
        color: $dark-font-color;
    }

    &.highlight-card {
        border-bottom: 4px solid $liquid-lava;
        .num {
            color: $liquid-lava;
        }
    }
}

.lava-text {
    color: $liquid-lava !important;
}

/* 2. Status Grid */
.status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 15px;
}

.status-card {
    background-color: $white;
    padding: 15px;
    border-radius: 12px;
    text-align: center;
    border: 1px solid $dark-border-color;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);

    h3 {
        font-size: 0.9rem;
        color: $secondary-text;
        margin-bottom: 5px;
    }

    .num {
        font-size: 1.8rem;
        font-weight: bold;
        color: $dark-font-color;
    }

    &.up {
        border-top: 4px solid $status-up;
        .num { color: $status-up; }
    }

    &.down {
        border-top: 4px solid $danger;
        .num { color: $danger; }
        &.active {
            background-color: rgba($danger, 0.05);
            box-shadow: 0 5px 15px rgba($danger, 0.15);
        }
    }

    &.maintenance {
        border-top: 4px solid $maintenance;
        .num { color: $maintenance; }
        &.active {
            background-color: rgba($maintenance, 0.05);
        }
    }

    &.unknown  .num { color: $secondary-text; }
    &.pause .num { color: $secondary-text; }
}

/* 3. Client Details List */
.client-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.client-card {
    background-color: $dark-bg2;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid $dark-border-color;
    box-shadow: 0 2px 5px rgba(0,0,0,0.03);
    transition: all 0.2s ease;

    &:hover {
        border-color: rgba($liquid-lava, 0.3);
        box-shadow: 0 5px 15px rgba(0,0,0,0.08);
    }
}

.client-header {
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
        background-color: rgba($liquid-lava, 0.02);
    }
}

.client-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.client-name {
    font-size: 1.2rem;
    font-weight: 700;
    color: $dark-font-color;
}

.monitor-badge {
    background-color: $obsidian-tide;
    color: white;
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 50px;
    font-family: 'Inter', sans-serif;
}

.client-summary {
    display: flex;
    align-items: center;
}

.arrow-icon {
    transition: transform 0.3s ease;
    margin-left: 10px;
    color: $secondary-text;
}

.client-details {
    padding: 24px;
    background-color: #fafafa; // Very light grey for contrast in expanded area
    border-top: 1px solid $dark-border-color;

    h6 {
        color: $secondary-text;
        font-size: 0.85rem;
        margin-bottom: 8px;
        text-transform: uppercase;
        font-weight: 600;
    }

    .big-num {
        font-size: 2rem;
        font-weight: 700;
    }
}

/* General & Table */
.shadow-box {
    padding: 20px;
    background-color: $white;
    border-radius: 16px;
    border: 1px solid $dark-border-color;
    box-shadow: 0 4px 6px rgba(0,0,0,0.02);
}

table {
    font-size: 14px;
    color: $dark-font-color;
    tr { transition: all ease-in-out 0.2ms; }
    
    th {
        color: $secondary-text;
        font-family: 'Roboto Slab', serif;
        font-weight: 600;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

@media screen and (max-width: 1280px) {
    .name-column { min-width: 150px; }
}

@media screen and (min-aspect-ratio: 4/3) {
    .name-column { min-width: 200px; }
}
</style>
