<template>
    <div ref="modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        {{ $t("Service Availability Report") }}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label for="report-year" class="form-label">{{ $t("Year") }}</label>
                            <select id="report-year" v-model="year" class="form-select">
                                <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="report-month" class="form-label">{{ $t("Month") }}</label>
                            <select id="report-month" v-model="month" class="form-select">
                                <option v-for="(m, index) in months" :key="index" :value="index">{{ m }}</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label for="report-week" class="form-label">{{ $t("Week (Optional)") }}</label>
                            <select id="report-week" v-model="week" class="form-select">
                                <option :value="null">{{ $t("Full Month") }}</option>
                                <option :value="0">{{ $t("Week 1") }}</option>
                                <option :value="1">{{ $t("Week 2") }}</option>
                                <option :value="2">{{ $t("Week 3") }}</option>
                                <option :value="3">{{ $t("Week 4") }}</option>
                                <option :value="4">{{ $t("Week 5") }}</option>
                            </select>
                        </div>
                    </div>

                    <div class="mt-4 text-center">
                        <button class="btn btn-primary" :disabled="loading" @click="generateReport">
                            <font-awesome-icon v-if="loading" icon="spinner" spin />
                            {{ $t("Generate Report") }}
                        </button>
                    </div>

                    <div v-if="reportData" class="mt-4 result-box">
                        <hr />
                        <h4 class="text-center">{{ startDate }} - {{ endDate }}</h4>
                        <div class="row text-center mt-3">
                            <div class="col-6">
                                <h5>{{ $t("Uptime") }}</h5>
                                <div class="uptime-value">{{ (reportData.uptime * 100).toFixed(3) }}%</div>
                            </div>
                            <div class="col-6">
                                <h5>{{ $t("Avg. Response Time") }}</h5>
                                <div class="ping-value">{{ reportData.avgPing ? reportData.avgPing.toFixed(2) + ' ms' : $t("notAvailableShort") }}</div>
                            </div>
                        </div>
                        <div class="row text-center mt-3">
                            <div class="col-6">
                                <h5>{{ $t("Total Up") }}</h5>
                                <div>{{ reportData.totalUp }}</div>
                            </div>
                            <div class="col-6">
                                <h5>{{ $t("Total Down") }}</h5>
                                <div>{{ reportData.totalDown }}</div>
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
import dayjs from "dayjs";

export default {
    props: {
        monitorId: {
            type: [ Number, String ],
            required: true,
        },
    },
    data() {
        const now = dayjs();
        return {
            modal: null,
            year: now.year(),
            month: now.month(),
            week: null,
            loading: false,
            reportData: null,
            startDate: "",
            endDate: "",
            years: [],
            months: [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ],
        };
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
        const currentYear = dayjs().year();
        for (let i = currentYear; i >= currentYear - 5; i--) {
            this.years.push(i);
        }
    },
    methods: {
        show() {
            this.modal.show();
        },
        generateReport() {
            this.loading = true;
            this.reportData = null;
            this.$root.getSocket().emit("getServiceAvailabilityReport", this.monitorId, this.year, this.month, this.week, (res) => {
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

.result-box {
    padding: 20px;
    border-radius: 10px;
}

.uptime-value {
    font-size: 1.5rem;
    font-weight: bold;
    color: $primary;
}

.ping-value {
    font-size: 1.5rem;
    font-weight: bold;
}

.dark {
    .modal-content {
        background-color: $dark-bg;
        color: $dark-font-color;
    }
    .modal-header {
        border-bottom: 1px solid $dark-border-color;
    }
}

@media print {
    .modal {
        position: absolute;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    .modal-dialog {
        max-width: 100%;
        margin: 0;
    }
    .modal-content {
        box-shadow: none;
        border: none;
    }
    .modal-header, .btn-close, .btn, form, select, label, .modal-title {
        display: none !important;
    }
    .modal-body > .row {
        display: none !important;
    }
    .mt-4.text-center {
        display: none !important;
    }
    .result-box {
        margin-top: 0 !important;
        padding: 0;
    }
    /* Force visible elements */
    .result-box * {
        visibility: visible;
    }
    .result-box {
        visibility: visible;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
    }
    
    /* Ensure text is black for printing */
    body, .dark .modal-content {
        color: black !important;
        background-color: white !important;
    }
}

</style>
