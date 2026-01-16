<template>
    <div class="modal fade" id="shiftReportDialog" tabindex="-1" aria-labelledby="shiftReportDialogLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="shiftReportDialogLabel">{{ $t("Intelligent Shift Report (Beta)") }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div v-if="loading" class="text-center my-5">
                        <div class="spinner-border" role="status"></div>
                        <p class="mt-2">{{ $t("Asking SRE Agent to analyze shift logs...") }}</p>
                    </div>

                    <div v-else-if="!report" class="text-center my-4">
                        <p>{{ $t("Generate a summary of incidents for your configured shift window.") }}</p>
                        <button class="btn btn-primary btn-lg" @click="generateReport">
                            <font-awesome-icon icon="magic" /> {{ $t("Generate Report") }}
                        </button>
                    </div>

                    <div v-else>
                        <div class="alert alert-info">
                            <strong>{{ $t("Period") }}:</strong> {{ formatTime(report.period.start) }} - {{ formatTime(report.period.end) }}
                        </div>
                        
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">{{ $t("Executive Summary") }}</h6>
                                <p class="card-text note-text" style="white-space: pre-wrap;">{{ report.summary }}</p>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="card bg-light">
                                    <div class="card-body text-center">
                                        <h3>{{ report.incident_count }}</h3>
                                        <small>{{ $t("Total Incidents") }}</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="card bg-light">
                                    <div class="card-body text-center">
                                        <h3>{{ report.critical_count }}</h3>
                                        <small>{{ $t("Critical Events") }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ $t("Close") }}</button>
                    <button v-if="report" type="button" class="btn btn-outline-primary" @click="copyReport">
                        <font-awesome-icon icon="copy" /> {{ $t("Copy") }}
                    </button>
                    <button v-if="report" type="button" class="btn btn-primary" @click="generateReport">
                        <font-awesome-icon icon="redo" /> {{ $t("Regenerate") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { Modal } from "bootstrap";
import axios from "axios";
import dayjs from "dayjs";

export default {
    data() {
        return {
            loading: false,
            report: null,
            modal: null,
        };
    },
    mounted() {
        this.modal = new Modal(document.getElementById("shiftReportDialog"));
    },
    methods: {
        show() {
            this.modal.show();
        },
        async generateReport() {
            this.loading = true;
            this.report = null;
            try {
                // Call the API - it will use settings defaults if params are omitted
                const res = await axios.get("/api/reports/shift-summary");
                this.report = res.data;
            } catch (error) {
                this.$root.toastError("Failed to generate report: " + error.message);
            } finally {
                this.loading = false;
            }
        },
        formatTime(isoStr) {
            return dayjs(isoStr).format("YYYY-MM-DD HH:mm");
        },
        copyReport() {
            if (this.report) {
                navigator.clipboard.writeText(this.report.summary).then(() => {
                    this.$root.toastSuccess("Summary copied to clipboard");
                });
            }
        }
    }
};
</script>

<style scoped>
.note-text {
    font-size: 1.1em;
    line-height: 1.6;
}
</style>
