<template>
    <div ref="modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        {{ $t("Weekly Report") }}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                </div>
                <div class="modal-body">
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label for="weeks-ago" class="form-label">{{ $t("Select Week") }}</label>
                            <select id="weeks-ago" v-model="weeksAgo" class="form-select">
                                <option :value="0">{{ $t("Current Week") }}</option>
                                <option :value="1">{{ $t("Last Week") }}</option>
                                <option :value="2">{{ $t("2 Weeks Ago") }}</option>
                                <option :value="3">{{ $t("3 Weeks Ago") }}</option>
                                <option :value="4">{{ $t("4 Weeks Ago") }}</option>
                            </select>
                        </div>
                        <div class="col-md-6 d-flex align-items-end">
                            <button class="btn btn-primary w-100" :disabled="loading" @click="generateReport">
                                <font-awesome-icon v-if="loading" icon="spinner" spin />
                                {{ $t("Generate Report") }}
                            </button>
                        </div>
                    </div>

                    <div v-if="reportData" class="report-container">
                        <div class="report-header">
                            <h4 class="text-center mb-3">{{ startDate }} - {{ endDate }}</h4>
                        </div>

                        <div class="row text-center mb-4">
                            <div class="col-md-3">
                                <div class="stat-card">
                                    <h6>{{ $t("Uptime") }}</h6>
                                    <div class="stat-value uptime">{{ (reportData.uptime * 100).toFixed(3) }}%</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="stat-card">
                                    <h6>{{ $t("Avg. Response Time") }}</h6>
                                    <div class="stat-value">{{ reportData.avgPing ? reportData.avgPing.toFixed(2) + ' ms' : $t("notAvailableShort") }}</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="stat-card">
                                    <h6>{{ $t("Total Up") }}</h6>
                                    <div class="stat-value success">{{ reportData.totalUp }}</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="stat-card">
                                    <h6>{{ $t("Total Down") }}</h6>
                                    <div class="stat-value danger">{{ reportData.totalDown }}</div>
                                </div>
                            </div>
                        </div>

                        <div v-if="reportData.dailyStats && reportData.dailyStats.length > 0" class="daily-breakdown">
                            <h5 class="mb-3">{{ $t("Daily Breakdown") }}</h5>
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>{{ $t("Date") }}</th>
                                            <th>{{ $t("Uptime") }}</th>
                                            <th>{{ $t("Avg. Ping") }}</th>
                                            <th>{{ $t("Checks") }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="day in reportData.dailyStats" :key="day.date">
                                            <td>{{ day.date }}</td>
                                            <td>{{ (day.uptime * 100).toFixed(2) }}%</td>
                                            <td>{{ day.avgPing ? day.avgPing.toFixed(2) + ' ms' : $t("notAvailableShort") }}</td>
                                            <td>{{ day.checks }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { Modal } from "bootstrap";

export default {
    props: {
        monitorId: {
            type: [ Number, String ],
            required: true,
        },
    },
    data() {
        return {
            modal: null,
            weeksAgo: 0,
            loading: false,
            reportData: null,
            startDate: "",
            endDate: "",
        };
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },
    methods: {
        show() {
            this.modal.show();
        },
        generateReport() {
            this.loading = true;
            this.reportData = null;
            this.$root.getSocket().emit("getWeeklyReport", this.monitorId, this.weeksAgo, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.reportData = res;
                    this.startDate = res.startDate;
                    this.endDate = res.endDate;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.report-container {
    margin-top: 20px;
}

.report-header {
    padding: 15px;
    background: $light;
    border-radius: 8px;
    margin-bottom: 20px;
}

.stat-card {
    padding: 15px;
    background: $light;
    border-radius: 8px;
    
    h6 {
        margin-bottom: 10px;
        color: $secondary;
        font-size: 0.9rem;
    }
}

.stat-value {
    font-size: 1.8rem;
    font-weight: bold;
    color: $dark;
    
    &.uptime {
        color: $primary;
    }
    
    &.success {
        color: $success;
    }
    
    &.danger {
        color: $danger;
    }
}

.daily-breakdown {
    margin-top: 30px;
    
    h5 {
        color: $dark;
    }
}

.dark {
    .modal-content {
        background-color: $dark-bg;
        color: $dark-font-color;
    }
    
    .modal-header {
        border-bottom: 1px solid $dark-border-color;
    }
    
    .report-header {
        background: $dark-bg2;
    }
    
    .stat-card {
        background: $dark-bg2;
        
        h6 {
            color: $dark-font-color2;
        }
    }
    
    .stat-value {
        color: $dark-font-color;
    }
    
    .table {
        color: $dark-font-color;
        
        thead {
            border-color: $dark-border-color;
        }
        
        tbody {
            border-color: $dark-border-color;
        }
    }
    
    .table-striped tbody tr:nth-of-type(odd) {
        background-color: rgba(255, 255, 255, 0.05);
    }
}
</style>
