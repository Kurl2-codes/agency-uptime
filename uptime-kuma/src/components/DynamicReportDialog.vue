<template>
    <div ref="modal" class="modal fade" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        {{ $t("Service Availability Report") }}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                </div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">{{ $t("Report Type") }}</label>
                            <select v-model="reportType" class="form-select">
                                <option value="monthly">{{ $t("Monthly") }}</option>
                                <option value="weekly">{{ $t("Weekly") }}</option>
                            </select>
                        </div>

                        <template v-if="reportType === 'monthly'">
                            <div class="col-md-3">
                                <label class="form-label">{{ $t("Year") }}</label>
                                <select v-model="year" class="form-select">
                                    <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ $t("Month") }}</label>
                                <select v-model="month" class="form-select">
                                    <option v-for="(m, index) in months" :key="index" :value="index">{{ m }}</option>
                                </select>
                            </div>
                        </template>

                        <template v-if="reportType === 'weekly'">
                            <div class="col-md-6">
                                <label class="form-label">{{ $t("Select Week") }}</label>
                                <select v-model="week" class="form-select">
                                    <option :value="0">{{ $t("Current Week") }}</option>
                                    <option :value="1">{{ $t("Last Week") }}</option>
                                    <option :value="2">{{ $t("2 Weeks Ago") }}</option>
                                    <option :value="3">{{ $t("3 Weeks Ago") }}</option>
                                    <option :value="4">{{ $t("4 Weeks Ago") }}</option>
                                </select>
                            </div>
                        </template>

                        <!-- Buttons Row (Moved from Header) -->
                        <div class="col-md-3 d-flex align-items-end gap-2">
                            <button class="btn btn-primary flex-grow-1" :disabled="loading" @click="generateReport">
                                <font-awesome-icon v-if="loading" icon="spinner" spin />
                                <span v-else>{{ $t("Generate") }}</span>
                            </button>

                            <!-- Print & Download Buttons (Visible only when reportData exists) -->
                            <template v-if="reportData">
                                <button class="btn btn-outline-info" :title="$t('Print')" @click="printReport">
                                    <font-awesome-icon icon="print" />
                                </button>
                                <button class="btn btn-outline-primary" :title="$t('Download PDF')" @click="downloadPDF">
                                    <font-awesome-icon icon="file-pdf" />
                                </button>
                            </template>
                        </div>
                    </div>

                    <div v-if="reportData" class="report-container mt-4">
                        <!-- Custom PDF Header (Hidden on Screen) -->
                        <div class="pdf-only d-none mb-4">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h2 class="mb-0 fw-bold" style="font-size: 24px;">
                                    Service Availability Report
                                </h2>
                                <img :src="logoImg" style="height: 50px; max-width: 200px; object-fit: contain;" alt="Shore360 Agency" />
                            </div>
                            <div class="text-center text-white py-2 fw-bold" style="background-color: #002060;">
                                {{ reportData.isGroup ? reportData.groupName : (monitor ? monitor.url : '') }}
                            </div>
                        </div>

                        <!-- Standard Report Header (Date Range) -->
                        <div class="report-header mb-4 text-center">
                            <h4>{{ formatDate(startDate) }} - {{ formatDate(endDate) }}</h4>
                            
                            <!-- Group Name for Groups -->
                            <h2 v-if="reportData.isGroup" class="mb-5 text-obsidian-blue fw-bold font-slab text-uppercase letter-spacing-wide">
                    {{ reportData.groupName }}
                </h2>
                            <p v-if="reportData.isGroup" class="text-taupe small text-uppercase ls-wide mt-n4 mb-5">Agency Report</p>
                            
                            <small v-else class="text-muted">{{ $t("Report generated for Monitor") }} #{{ monitorId }}</small>
                        </div>

                        <!-- STACKED REPORT VIEW (Iterates for Single or Group Children) -->
                        <div v-for="(reportItem, index) in reportsToList" :key="reportItem.id || index" class="report-section mb-5">
                            
                            <!-- Child Monitor Header (Only if Group) -->
                            <div v-if="reportData.isGroup" class="child-header mb-4 mt-5 pb-2 border-bottom">
                                <h3 class="fw-bold text-obsidian-blue">{{ reportItem.name }}</h3>
                            </div>

                            <!-- Summary Cards (5-Column Layout) -->
                            <div class="row row-cols-1 row-cols-md-5 g-3 text-center mb-5 justify-content-center">
                                <!-- 1. Availability -->
                                <div class="col">
                                    <div class="stat-card shadow-sm h-100">
                                        <div class="icon-wrapper bg-soft-primary mb-3">
                                            <font-awesome-icon icon="check-circle" class="text-primary" />
                                        </div>
                                        <h6 class="text-muted text-uppercase ls-1">{{ $t("Availability") }}</h6>
                                        <div class="stat-value fw-bold" :class="getUptimeColorClass(reportItem.summary.uptime)">
                                            {{ Number((reportItem.summary.uptime * 100).toFixed(2)) }}%
                                        </div>
                                    </div>
                                </div>

                                <!-- 2. Outage Duration -->
                                <div class="col">
                                    <div class="stat-card shadow-sm h-100">
                                        <div class="icon-wrapper bg-soft-danger mb-3">
                                            <font-awesome-icon icon="exclamation-triangle" class="text-danger" />
                                        </div>
                                        <h6 class="text-muted text-uppercase ls-1">{{ $t("Downtime") }}</h6>
                                        <div class="stat-value fw-bold text-danger">
                                            {{ (reportItem.summary.totalDowntimeDuration === '0s' || reportItem.summary.totalDowntimeDuration === '0 seconds') ? '0' : reportItem.summary.totalDowntimeDuration }}
                                        </div>
                                    </div>
                                </div>

                                <!-- 3. Count -->
                                <div class="col">
                                    <div class="stat-card shadow-sm h-100">
                                        <div class="icon-wrapper bg-soft-warning mb-3">
                                            <font-awesome-icon icon="hashtag" class="text-warning" />
                                        </div>
                                        <h6 class="text-muted text-uppercase ls-1">{{ $t("Incidents") }}</h6>
                                        <div class="stat-value fw-bold text-dark-mode-white">
                                            {{ reportItem.summary.downtimeCount }}
                                        </div>
                                    </div>
                                </div>

                                <!-- 4. Avg Response -->
                                <div class="col">
                                    <div class="stat-card shadow-sm h-100">
                                        <div class="icon-wrapper bg-soft-info mb-3">
                                            <font-awesome-icon icon="stopwatch" class="text-info" />
                                        </div>
                                        <h6 class="text-muted text-uppercase ls-1">{{ $t("Avg. Ping") }}</h6>
                                        <div class="stat-value fw-bold">
                                            {{ reportItem.summary.avgPing ? reportItem.summary.avgPing.toFixed(0) + 'ms' : 'N/A' }}
                                        </div>
                                    </div>
                                </div>

                                <!-- 5. SSL Expiry -->
                                <div class="col">
                                    <div class="stat-card shadow-sm h-100">
                                        <div class="icon-wrapper bg-soft-success mb-3">
                                            <font-awesome-icon icon="certificate" class="text-success" />
                                        </div>
                                        <h6 class="text-muted text-uppercase ls-1">{{ $t("SSL Expiry") }}</h6>
                                        <div
                                            v-if="reportItem.summary.certInfo && reportItem.summary.certInfo.daysLeft !== 'N/A'"
                                            class="stat-value fw-bold"
                                            :class="reportItem.summary.certInfo.daysLeft > 30 ? 'text-success' : 'text-danger'"
                                        >
                                            {{ reportItem.summary.certInfo.daysLeft }} Days
                                        </div>
                                        <div v-else class="stat-value fw-bold text-muted">
                                            N/A
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Daily Breakdown -->
                            <div v-if="reportItem.dailyStats && reportItem.dailyStats.length > 0" class="section mb-5">
                                <h5 class="section-title">{{ $t("Availability Percentage Trend") }}</h5>

                                <div v-if="reportItem.dailyStats.length > 1" class="mb-3" style="height: 300px;">
                                    <DailyAvailabilityChart :daily-stats="reportItem.dailyStats" />
                                </div>

                                <div v-else class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>{{ $t("Date") }}</th>
                                                <th>{{ $t("Availability") }}</th>
                                                <th>{{ $t("Status") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="day in reportItem.dailyStats" :key="day.date">
                                                <td>{{ formatDate(day.date) }}</td>
                                                <td>
                                                    <div class="progress" style="height: 20px;">
                                                        <div
                                                            class="progress-bar" role="progressbar"
                                                            :style="{width: (day.uptime * 100) + '%', backgroundColor: getUptimeColor(day.uptime)}"
                                                            aria-valuenow="day.uptime * 100" aria-valuemin="0" aria-valuemax="100"
                                                        >
                                                            {{ Number((day.uptime * 100).toFixed(2)) }}%
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span v-if="day.down > 0" class="badge bg-warning text-dark">Spike Incident</span>
                                                    <span v-else-if="day.maintenance > 0" class="badge bg-info text-dark">{{ $t("Maintenance") }}</span>
                                                    <span v-else class="badge bg-success">{{ $t("Available") }}</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Overall Outage Details -->
                            <div class="section mb-5">
                                <h5 class="section-title text-danger">{{ $t("Overall Outage Details") }}</h5>
                                <div v-if="reportItem.downtimeEvents.length === 0" class="alert alert-success">
                                    {{ $t("No downtime incidents reported in this period.") }}
                                </div>
                                <div v-else class="table-responsive">
                                    <table class="table table-striped table-bordered">
                                        <thead class="table-danger">
                                            <tr>
                                                <th style="width: 150px;">{{ $t("From Time") }}</th>
                                                <th style="width: 150px;">{{ $t("To Time") }}</th>
                                                <th style="width: 120px;">{{ $t("Duration") }}</th>
                                                <th style="width: 25%;">{{ $t("Reason") }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(event, eIndex) in reportItem.downtimeEvents" :key="eIndex">
                                                <td>
                                                    <span class="fw-bold">{{ formatDate(event.startTime) }}</span><br>
                                                    <small class="text-muted">{{ formatTime(event.startTime) }}</small>
                                                </td>
                                                <td>
                                                    <span class="fw-bold">{{ event.endTime ? formatDate(event.endTime) : 'Ongoing' }}</span><br>
                                                    <small class="text-muted">{{ event.endTime ? formatTime(event.endTime) : '' }}</small>
                                                </td>
                                                <td class="align-middle fw-bold">
                                                    {{ event.durationStr }}
                                                </td>
                                                <td class="text-danger align-middle">
                                                    {{ event.msg }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- Analysis and Recommendation (Grouped) -->
                            <div v-if="reportItem.groupedAnalysis && reportItem.groupedAnalysis.length > 0" class="section mb-5">
                                <h5 class="section-title text-primary">{{ $t("Analysis and Recommendation") }}</h5>
                                <div class="card border-0 shadow-sm bg-light">
                                    <div class="card-body">
                                        <div v-for="(analysis, aIndex) in reportItem.groupedAnalysis" :key="aIndex" class="mb-4">
                                            <h6 class="fw-bold text-danger mb-2 d-flex align-items-center">
                                                <font-awesome-icon icon="exclamation-circle" class="me-2" />
                                                {{ analysis.error }}
                                                
                                                <button class="btn btn-sm btn-outline-secondary ms-auto" style="font-size: 0.7rem;" 
                                                        @click="retryAnalysis(reportItem.id || monitorId, analysis)" 
                                                        :disabled="analysis.loading">
                                                    <font-awesome-icon :icon="analysis.loading ? 'spinner' : 'sync'" :spin="analysis.loading" class="me-1" />
                                                    {{ analysis.loading ? $t("Retrying...") : $t("Retry Analysis") }}
                                                </button>
                                            </h6>
                                            <div class="ps-4 text-muted small">
                                                <div v-html="analysis.advice"></div>
                                            </div>
                                            <hr v-if="aIndex < reportItem.groupedAnalysis.length - 1" class="my-3 text-muted opacity-25">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Monitor Availability Summary -->
                            <div class="row g-4 mb-5">
                                <div class="col-md-6">
                                    <div class="section h-100 p-4 border rounded bg-light dark-bg-2">
                                        <h5 class="section-title mb-4">{{ $t("Monitor Availability Summary") }}</h5>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Downtime") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.totalDowntimePercent }}% OR {{ (reportItem.summary.totalDowntimeDuration === '0s' || reportItem.summary.totalDowntimeDuration === '0 seconds') ? '0' : reportItem.summary.totalDowntimeDuration }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Uptime") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.totalUptimePercent }}% OR {{ reportItem.summary.totalUptimeDuration }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("MTTR") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.mttr }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("MTBF") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.mtbf }}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="section h-100 p-4 border rounded bg-light dark-bg-2">
                                        <h5 class="section-title mb-4">{{ $t("Monitor Suspended Summary") }}</h5>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Suspended Time") }}</span>
                                            <span class="fw-bold">0</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Suspended Time Percentage") }}</span>
                                            <span class="fw-bold">0.00%</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Scheduled Maintenance") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.maintenanceDuration }}</span>
                                        </div>
                                        <div class="d-flex justify-content-between mb-2">
                                            <span>{{ $t("Total Scheduled Maintenance Percentage") }}</span>
                                            <span class="fw-bold">{{ reportItem.summary.maintenancePercent }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Separator -->
                             <hr v-if="index !== reportsToList.length - 1" class="my-5" style="border-top: 3px dashed #e0e0e0;">

                        </div> <!-- End v-for reportsToList -->

                        <!-- Glossary -->
                        <div class="section mt-5 border p-3 rounded">
                            <div class="mb-3">
                                <h6 class="fw-bold">{{ $t("Mean Time To Repair (MTTR)") }}</h6>
                                <p class="small text-muted mb-0">
                                    The average time to repair a device or a system back to acceptable operating conditions.
                                    The term can also mean, the time spent to restore a machine to operating condition after failure.
                                    This must be as low as possible.
                                </p>
                            </div>
                            <div>
                                <h6 class="fw-bold">{{ $t("Mean Time Between Failures (MTBF)") }}</h6>
                                <p class="small text-muted mb-0">
                                    The average time that a device or a system worked without failure.
                                    The term can also mean the length of time a user may reasonably expect a device or system to work before an incapacitating fault occurs.
                                    This must be as high as possible.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Hidden Professional PDF Template (Off-screen) -->
        <div v-if="reportData" style="position: fixed; left: -10000px; top: 0; width: 800px; z-index: -1;">
            <ProfessionalPdfTemplate
                ref="pdfTemplate"
                :monitor="monitor"
                :report-data="reportData"
                :start-date="startDate"
                :end-date="endDate"
                :monitor-id="monitorId"
            />
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { Modal } from "bootstrap";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import logoImg from "../assets/image.png";
import ProfessionalPdfTemplate from "./ProfessionalPdfTemplate.vue";
import DailyAvailabilityChart from "./DailyAvailabilityChart.vue";
import { jsPDF } from "jspdf";

dayjs.extend(utc);
dayjs.extend(timezone);

export default defineComponent({
    components: {
        ProfessionalPdfTemplate,
        DailyAvailabilityChart,
    },
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
            reportType: "weekly",
            year: now.year(),
            month: now.month(),
            week: 0,
            loading: false,
            reportData: null as any,
            startDate: "",
            endDate: "",
            years: [],
            months: [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ],
            logoImg,
        };
    },
    computed: {
        monitor() {
            return this.$root.monitorList[this.monitorId] || null;
        },
        reportsToList() {
            if (!this.reportData) {
                return [];
            }
            if (this.reportData.isGroup && this.reportData.groupChildren) {
                return this.reportData.groupChildren;
            }
            return [ this.reportData ];
        }
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

            // socket.emit("getDynamicReport", monitorID, type, year, month, week, callback)
            this.$root.getSocket().emit("getDynamicReport",
                this.monitorId,
                this.reportType,
                this.year,
                this.month,
                this.week,
                (res) => {
                    this.loading = false;
                    if (res.ok) {
                        this.reportData = res;
                        this.startDate = res.startDate;
                        this.endDate = res.endDate;
                    } else {
                        this.$root.toastError(res.msg);
                    }
                }
            );
        },
        formatDateTime(timeStr) {
            return dayjs.utc(timeStr).tz("Asia/Manila").format("MMMM D, YYYY HH:mm:ss");
        },

        formatTime(timeStr) {
            return dayjs.utc(timeStr).tz("Asia/Manila").format("HH:mm:ss");
        },
        formatDate(dateStr) {
            return dayjs.utc(dateStr).tz("Asia/Manila").format("MMMM D, YYYY");
        },
        // @ts-ignore
        // @ts-ignore
        getUptimeColor(uptime: number) {
            // Logic: 100% -> Green
            // 99% - 99.9% -> Light Orange
            // 98% - 99% -> Orange
            // 96% - 98% -> Dark Orange / Red-Orange
            // < 96% -> Red

            if (uptime >= 1.0) {
                return "#198754"; // Success Green
            }
            if (uptime >= 0.999) {
                 return "#198754"; // Still treat 99.9% as mostly green/success
            }
            if (uptime >= 0.99) {
                return "#ffc107"; // Light Orange / Warning Yellow
            }
            if (uptime >= 0.98) {
                return "#fd7e14"; // Orange
            }
            if (uptime >= 0.96) {
                return "#dc3545"; // Red (Monitoring standard usually jumps to red quickly below 98/99)
            }
            return "#dc3545"; // Danger Red
        },
        // @ts-ignore
        getUptimeColorClass(uptime: number) {
            if (uptime >= 0.99) {
                return "text-success";
            }
            if (uptime >= 0.95) {
                return "text-warning";
            }
            return "text-danger";
        },
        printReport() {
            window.print();
        },
        downloadPDF() {
            // Target the Professional PDF Template Component
            // @ts-ignore
            const element = this.$refs.pdfTemplate.$el;

            if (!element) {
                console.error("PDF Template not found");
                return;
            }

            // Using pure jsPDF html method for somewhat selectable text.
            // Note: This is still experimental in jsPDF but better than html2pdf for text.
            const doc = new jsPDF({
                orientation: "portrait",
                unit: "pt",
                format: "letter"
            });

            // 800px * 0.7 = 560pt. Letter width = 612pt.
            // Margin left/right approx (612 - 560) / 2 = 26pt to center.
            
            doc.html(element, {
                callback: function (doc) {
                    doc.save(`uptime-report.pdf`);
                },
                x: 26, // Centering offset (calculated)
                y: 20, // Top margin offset
                html2canvas: {
                    scale: 0.7, 
                    useCORS: true, 
                    allowTaint: true,
                    letterRendering: true,
                    scrollY: 0,
                },
                width: 800, 
                windowWidth: 800,
                margin: [20, 0, 20, 0], // Extra top/bottom auto-paging margins
                autoPaging: "text"
            });
        },

        retryAnalysis(monitorID, analysisItem) {
            analysisItem.loading = true;
            this.$root.getSocket().emit("retryAnalysis",
                monitorID,
                analysisItem.error,
                analysisItem.duration || "unknown", // Sent from backend now
                (res) => {
                    analysisItem.loading = false;
                    if (res.ok) {
                        analysisItem.advice = res.advice;
                        this.$root.toastSuccess("Analysis updated!");
                    } else {
                        this.$root.toastError(res.msg);
                    }
                }
            );
        },
    },
});


</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Roboto+Slab:wght@100..900&display=swap');

// Typography Classes
.font-slab { font-family: 'Roboto Slab', serif !important; }
.font-inter { font-family: 'Inter', sans-serif !important; }
.text-obsidian-blue { color: #0C1422 !important; }

.modal-content {
    border: none;
    box-shadow: 0 1rem 3rem rgba(0,0,0,0.15);
}

h1, h2, h3, h4, h5, h6, .modal-title, .stat-value, .stat-card h6, .section-title {
    font-family: 'Roboto Slab', serif !important;
}

/* Ensure body text and tables use Inter */
body, .modal-content, .table {
    font-family: 'Inter', sans-serif !important;
}

.font-slab {
    font-family: 'Roboto Slab', serif !important;
}

.modal-header {
    font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    border: none;
    box-shadow: 0 1rem 3rem rgba(0,0,0,0.15);
}

.report-container {
    padding: 20px;
}

// Header
.report-header {
    background: transparent;
    padding-bottom: 25px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    margin-bottom: 35px;

    h4 {
        color: #1a1e21;
        font-weight: 800;
        letter-spacing: -0.5px;
        margin-bottom: 5px;
    }
}

// 1. Stat Cards (Modern SaaS Style)
.stat-card {
    background: #fff;
    padding: 30px 25px;
    border-radius: 16px;
    border: 1px solid rgba(0,0,0,0.04);
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.03);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: relative;
    overflow: hidden;

    &:hover {
        transform: translateY(-5px);
        box-shadow: 0 1rem 2rem rgba(0,0,0,0.08);
        border-color: rgba(0,0,0,0.08);
    }

    .icon-wrapper {
        width: 56px;
        height: 56px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px auto;
        font-size: 1.4rem;
        transition: transform 0.3s ease;
    }

    &:hover .icon-wrapper {
        transform: scale(1.1) rotate(5deg);
    }

    h6 {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: #8898aa;
        margin-bottom: 10px;
    }

    .ls-wide {
        letter-spacing: 1.5px;
    }
    .letter-spacing-wide {
        letter-spacing: 3px;
    }

    .stat-value {
        font-size: 1.75rem;
        font-weight: 800;
        line-height: 1.2;
        color: #32325d;
    }
}

// Soft Backgrounds for Icons (Light Mode)
.bg-soft-primary { background-color: rgba(92, 221, 139, 0.1); color: $primary; } // Main brand color
.bg-soft-info { background-color: rgba(23, 71, 245, 0.1); color: $maintenance; }
.bg-soft-warning { background-color: rgba(248, 163, 6, 0.1); color: $warning; }
.bg-soft-danger { background-color: rgba(220, 53, 69, 0.1); color: $danger; }
.bg-soft-success { background-color: rgba(40, 167, 69, 0.1); color: #28a745; }

// 2. Section Titles
.section-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 25px;
    color: #32325d;
    display: flex;
    align-items: center;

    &::before {
        content: '';
        display: inline-block;
        width: 4px;
        height: 18px;
        background: $primary;
        margin-right: 12px;
        border-radius: 2px;
    }

    &.text-danger::before { background: $danger; }
}

// 3. Tables (Clean / Card Style)
.table-responsive {
    border-radius: 12px;
    box-shadow: 0 0 2rem rgba(0,0,0,0.02);
    border: 1px solid rgba(0,0,0,0.03);
    background: #fff;
    padding: 0;
}

.table {
    margin-bottom: 0;

    thead th {
        background-color: #f6f9fc;
        border-bottom: 1px solid #e9ecef;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.08em;
        font-weight: 700;
        color: #8898aa;
        padding: 1rem 1.5rem;
        border-top: none;
    }

    td {
        padding: 1.25rem 1.5rem;
        vertical-align: middle;
        font-size: 0.9rem;
        color: #525f7f;
        border-bottom: 1px solid #e9ecef;

        &:first-child { font-weight: 600; color: #32325d; }
    }

    tr:last-child td { border-bottom: none; }
    tr:hover td { background-color: #fcfcfd; }
}

// 4. Badges (Soft Pills)
.badge {
    padding: 0.5em 0.8em;
    font-weight: 600;
    font-size: 0.75rem;
    border-radius: $border-radius;
    letter-spacing: 0.3px;

    &.bg-success {
        background-color: rgba(92, 221, 139, 0.15) !important;
        color: darken($primary, 10%) !important;
    }
    &.bg-warning {
        background-color: rgba(248, 163, 6, 0.15) !important;
        color: darken($warning, 5%) !important;
    }
    &.bg-danger {
        background-color: rgba(220, 53, 69, 0.15) !important;
        color: $danger !important;
    }
}

// Progress Bar
.progress {
    background-color: #e9ecef;
    border-radius: $border-radius;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
}

// 5. Info/Summary Boxes
.section.border.rounded {
    border: 1px solid rgba(0,0,0,0.05) !important;
    border-radius: 16px !important;
    background: #f8f9fe;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.01);

    .d-flex span:first-child {
        color: #8898aa;
        font-weight: 500;
        font-size: 0.9rem;
    }

    .d-flex span.fw-bold {
        color: #32325d;
        font-family: 'Courier New', monospace;
        letter-spacing: -0.5px;
    }
}

// Certificate/Expiry Box
.report-header .border.rounded {
    background: #fff;
    border: 1px solid rgba(0,0,0,0.08) !important;
    box-shadow: 0 4px 6px rgba(0,0,0,0.03);
    border-left: 4px solid $primary;
}

/* --- DARK MODE (Uptime Kuma Native) --- */
.dark {
    .modal-content {
        background-color: $dark-bg; // Native App Background
        color: $dark-font-color;
        box-shadow: 0 1rem 3rem rgba(0,0,0,0.3);
    }

    .modal-header, .report-header {
        border-bottom-color: $dark-border-color;
        h4 { color: #fff; }
    }

    .btn-close { filter: invert(1); }

    .stat-card {
        background: $dark-header-bg; // Native Card/Header Background
        border-color: $dark-border-color;

        h6 { color: $dark-font-color !important; opacity: 0.7; }
        .stat-value { color: #fff; }

        &:hover {
            background: lighten($dark-header-bg, 3%);
            box-shadow: 0 1rem 3rem rgba(0,0,0,0.2) !important;
        }

        // Adjust soft colors for dark mode context
        .bg-soft-primary { background: rgba(92, 221, 139, 0.15); color: lighten($primary, 5%); }
        .bg-soft-info { background: rgba(23, 71, 245, 0.2); color: lighten($maintenance, 10%); }
        .bg-soft-warning { background: rgba(248, 163, 6, 0.15); color: lighten($warning, 5%); }
        .bg-soft-danger { background: rgba(220, 53, 69, 0.15); color: lighten($danger, 5%); }
    }

    .section-title {
        color: #fff;
    }

    // Dark Table
    .table-responsive {
        background: $dark-header-bg;
        border-color: $dark-border-color;
    }

    .table {
        thead th {
            background-color: rgba(0,0,0,0.2);
            color: $dark-font-color;
            border-bottom-color: $dark-border-color;
        }

        td {
            color: $dark-font-color !important;
            border-bottom-color: $dark-border-color;

            &:first-child { color: #fff !important; }
        }

        tr:hover td { background-color: rgba(255,255,255,0.03); }

        .text-danger { color: $danger !important; }
        .text-primary { color: $primary !important; }
        small.text-muted { color: darken($dark-font-color, 20%) !important; }
    }

    // Dark Badges
    .badge.bg-success { background: rgba(92, 221, 139, 0.15) !important; color: $primary !important; }
    .badge.bg-warning { background: rgba(248, 163, 6, 0.15) !important; color: $warning !important; }
    .badge.bg-danger { background: rgba(220, 53, 69, 0.15) !important; color: $danger !important; }

    // Dark Info Boxes
    .section.border.rounded, .report-header .border.rounded {
        background: $dark-header-bg !important;
        border-color: $dark-border-color !important;

        .d-flex span:first-child { color: $dark-font-color; }
        .d-flex span.fw-bold { color: #fff; }
    }

    .bg-light { background-color: $dark-header-bg !important; }
}

@media print {
    .modal {
        position: absolute;
        width: 100%;
        height: 100%;
        overflow: visible !important;
    }
    .modal-dialog {
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    .modal-content {
        box-shadow: none !important;
        border: none !important;
        background: white !important;
        color: black !important;
    }

    // Hide all UI controls
    .modal-header,
    .btn-close,
    .modal-body > .row.g-3, // Filters row
    .btn,
    .btn-print-report,
    form,
    select,
    label,
    .modal-title {
        display: none !important;
    }

    .report-container {
        margin-top: 0 !important;
        padding: 0 !important;
    }

    // Ensure colors are preserved if desired, or flattened for print
    .stat-card {
        box-shadow: none !important;
        border: 1px solid #eee !important;
        page-break-inside: avoid;
    }

    .table-responsive {
        box-shadow: none !important;
        border: 1px solid #eee !important;
        overflow: visible !important;
    }

    .section {
        page-break-inside: avoid;
    }

    // Force background visibility for progress bars if possible (most browsers need user setting though)
    .progress-bar {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
    }

    // Remove fixed heights/widths that might break paging
    .modal-body {
        padding: 0 !important;
    }

    body {
        margin: 0;
        padding: 0;
    }
}
</style>
