<template>
    <div class="pdf-template agency-theme">
        <!-- 1. Persistent Header Section -->
        <div class="header-section mb-4">
            <div class="d-flex justify-content-between align-items-center px-4 pt-0 pb-2">
                <h1 class="report-title" :class="{ 'text-obsidian-blue': reportData?.isGroup }">
                    Service Availability Report
                </h1>
                <img :src="logoImg" class="brand-logo" alt="Shore360 Agency" />
            </div>

            <!-- URL Bar (Obsidian Blue Gradient) - Shows Group Name or URL -->
            <div class="url-bar text-center text-white py-2 fw-bold d-flex align-items-center justify-content-center gap-2">
                <i v-if="!reportData?.isGroup" class="fas fa-link" style="opacity: 0.7; font-size: 0.9em;"></i>
                {{ reportData?.isGroup ? reportData.groupName : ((monitor && monitor.url) ? cleanUrl(monitor.url) : 'Service Report') }}
            </div>
        </div>

        <!-- STACKED CONTENT (Single or Group Members) -->
        <div v-for="(reportItem, index) in reportsToList" :key="index" class="monitor-report-section" :class="{ 'last-monitor': index === reportsToList.length - 1 }">
            
            <!-- 2. Report Context (Date & Monitor Info) -->
            <div class="px-4 mb-4" :class="{ 'mt-5': Number(index) > 0 }">
                <div class="row align-items-end">
                    <div class="col-6">
                        <!-- Use Inter for Monitor Name to fix weird spacing/kerning issues -->
                        <h5 class="mb-1 fw-bold text-obsidian-blue font-inter" style="letter-spacing: 0 !important; white-space: nowrap !important; word-spacing: normal !important;">
                            {{ reportData?.isGroup ? cleanUrl(reportItem.name) : 'Official Service Report' }}
                        </h5>
                        <p class="text-taupe small mb-0 font-inter">
                            {{ reportData?.isGroup ? 'Agency Report' : 'Generated on ' + currentDateTime }}
                        </p>
                    </div>
                    <div class="col-6 text-end">
                        <!-- Refined Period Date Display -->
                        <div class="d-flex flex-column align-items-end">
                            <span class="text-taupe text-uppercase font-slab mb-1" style="font-size: 0.7rem; letter-spacing: 1.2px;">Reporting Period</span>
                            <div class="fw-bold text-obsidian-blue font-slab border-bottom border-2 border-liquid-lava pb-1" style="font-size: 1.1rem;">
                                {{ formatDate(startDate || '') }} — {{ formatDate(endDate || '') }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <hr class="mx-4 my-4" style="opacity: 0.1">

            <!-- 3. Executive Summary (Metrics) -->
            <div class="px-4 mb-5 avoid-break">
                <h6 class="section-label mb-3 font-slab">EXECUTIVE SUMMARY</h6>
                <div class="metrics-grid">
                    <!-- Availability -->
                    <div class="metric-card">
                        <div class="metric-label font-slab">Availability</div>
                        <div class="metric-value font-slab" :class="getUptimeColorClass(reportItem.summary.uptime)">
                            {{ Number((reportItem.summary.uptime * 100).toFixed(2)) }}%
                        </div>
                        <div class="metric-sub font-inter">Target: 99.9%</div>
                    </div>

                    <!-- Downtime -->
                    <div class="metric-card">
                        <div class="metric-label font-slab">Total Downtime</div>
                        <div class="metric-value font-slab text-liquid-lava">
                            {{ (reportItem.summary.totalDowntimeDuration === '0s' || reportItem.summary.totalDowntimeDuration === '0 seconds') ? '0' : reportItem.summary.totalDowntimeDuration }}
                        </div>
                        <div class="metric-sub font-inter">Duration</div>
                    </div>

                    <!-- Incidents -->
                    <div class="metric-card">
                        <div class="metric-label font-slab">Incidents</div>
                        <div class="metric-value font-slab text-obsidian-blue">
                            {{ reportItem.summary.downtimeCount || 0 }}
                        </div>
                        <div class="metric-sub font-inter">Total Events</div>
                    </div>

                    <!-- Avg Response -->
                    <div class="metric-card">
                        <div class="metric-label font-slab">Avg Latency</div>
                        <div class="metric-value font-slab text-obsidian-tide">
                            {{ reportItem.summary.avgPing ? reportItem.summary.avgPing.toFixed(0) : '0' }}ms
                        </div>
                        <div class="metric-sub font-inter">Response Time</div>
                    </div>

                    <!-- SSL Status -->
                    <div class="metric-card" :class="getSSLColorClass(reportItem.summary.certInfo?.daysLeft)">
                        <div class="metric-label font-slab">SSL Validity</div>
                        <div class="metric-value font-slab">
                            {{ reportItem.summary.certInfo?.daysLeft !== 'N/A' ? reportItem.summary.certInfo.daysLeft : 'N/A' }}
                        </div>
                        <div class="metric-sub font-inter">Days Remaining</div>
                    </div>
                </div>
            </div>

            <!-- 4. Daily Availability Trend -->
            <div v-if="reportItem.dailyStats && reportItem.dailyStats.length > 0" class="px-4 mb-5">
                <h6 class="section-label mb-3 font-slab">AVAILABILITY TREND</h6>

                <!-- Use Chart if date length > 1 (Show chart if more than 1 day) -->
                <!-- Use Chart if date length > 1 (Show chart if more than 1 day) -->
                <!-- Efficient CSS-based Status Trend (Atlassian Style) -->
                <div v-if="reportItem.dailyStats.length > 1" class="chart-container mb-4 avoid-break" style="height: auto; min-height: 60px;">
                    <DailyAvailabilityChart :daily-stats="reportItem.dailyStats" />
                </div>

                <table v-else class="table custom-table font-inter">
                    <thead>
                        <tr>
                            <th style="width: 25%" class="font-slab">Date</th>
                            <th style="width: 50%" class="font-slab">Availability</th>
                            <th style="width: 25%" class="font-slab">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="day in reportItem.dailyStats" :key="day.date" class="avoid-break">
                            <td class="fw-bold text-obsidian-blue">{{ formatDate(day.date) }}</td>
                            <td>
                                <div class="progress" style="height: 12px; background-color: #f3f4f6; border-radius: 6px;">
                                    <div
                                        class="progress-bar" role="progressbar"
                                        :style="{width: (day.uptime * 100) + '%', backgroundColor: getUptimeColor(day.uptime)}"
                                        aria-valuenow="day.uptime * 100" aria-valuemin="0" aria-valuemax="100"
                                    >
                                    </div>
                                </div>
                                <div class="small text-taupe mt-1 text-end">{{ Number((day.uptime * 100).toFixed(2)) }}%</div>
                            </td>
                            <td>
                                <span v-if="day.down > 0" class="badge badge-warning">Spike Incident</span>
                                <span v-else-if="day.maintenance > 0" class="badge badge-info">Maintenance</span>
                                <span v-else class="badge badge-success">Available</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 5. Downtime & Analysis Log -->
            <div v-if="reportItem.downtimeEvents?.length > 0" class="px-4 mb-5 pt-4 mt-3">
                <h6 class="section-label mb-3 font-slab">INCIDENT ANALYSIS LOG</h6>
                <table class="table custom-table font-inter">
                    <thead>
                        <tr>
                            <th style="width: 20%" class="font-slab">Time (Start / End)</th>
                            <th style="width: 15%" class="font-slab">Duration</th>
                            <th style="width: 30%" class="font-slab">Error / Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(event, eIndex) in reportItem.downtimeEvents" :key="eIndex" class="avoid-break">
                            <td>
                                <div class="fw-bold text-obsidian-blue">{{ formatDateShort(event.startTime) }}</div>
                                <div class="small text-taupe">{{ formatTime(event.startTime) }} - {{ event.endTime ? formatTime(event.endTime) : 'NOW' }}</div>
                            </td>
                            <td>
                                <span class="badge border text-taupe">{{ event.durationStr }}</span>
                            </td>
                            <td class="text-liquid-lava small font-monospace wrap-text">
                                {{ event.msg }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 6. Grouped Analysis & Recommendation -->
            <div v-if="reportItem.groupedAnalysis?.length > 0" class="px-4 mb-5">
                 <h6 class="section-label mb-3 font-slab">ANALYSIS & RECOMMENDATION</h6>
                 
                 <div class="analysis-container bg-light rounded p-4 border">
                    <div v-for="(analysis, idx) in reportItem.groupedAnalysis" :key="idx" class="analysis-item mb-4 avoid-break">
                        <div class="d-flex align-items-center mb-2">
                             <span class="badge badge-error me-2">Error</span>
                             <span class="fw-bold text-obsidian-blue font-slab wrap-text">{{ analysis.error }}</span>
                        </div>
                        <div class="response-content small text-taupe ps-3 border-start border-3 border-liquid-lava ms-2 wrap-text">
                            <!-- Sanitized Advice to remove emoji artifacts -->
                            <div v-html="sanitizeAdvice(analysis.advice)"></div>
                        </div>
                        
                        <hr v-if="idx < reportItem.groupedAnalysis.length - 1" class="my-4" style="opacity: 0.1">
                    </div>
                 </div>
            </div>

            <!-- Page Break handled by CSS on .monitor-report-section -->

        </div> <!-- End v-for reportsToList -->

        <!-- 6. Footer -->
        <div class="pdf-footer mt-auto">
            <div class="px-4 py-3 border-top d-flex justify-content-between text-taupe small font-inter">
                <span>© Shore360 Agency</span>
                <span>Automated System Report</span>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import dayjs from "dayjs";
// @ts-ignore
import logoImg from "../assets/image.png";
import DailyAvailabilityChart from "./DailyAvailabilityChart.vue";

export default {
    name: "ProfessionalPdfTemplate",
    components: {
        DailyAvailabilityChart,
    },
    props: {
        reportData: Object,
        monitor: Object,
        startDate: String,
        endDate: String,
        monitorId: [ Number, String ],
    },
    data() {
        return {
            logoImg,
        };
    },
    computed: {
        currentDateTime() {
            return dayjs().format("MMMM D, YYYY HH:mm");
        },
        reportsToList() {
            if (!this.reportData) {
                return [];
            }
            if (this.reportData.isGroup && this.reportData.groupChildren) {
                return this.reportData.groupChildren;
            }
            return [ this.reportData ];
        },
    },
    methods: {
        sanitizeAdvice(advice: string) {
            if (!advice) return '';
            // HTML decode safely if needed, but assuming string.
            // Remove common status emojis (🔴, 🟢, 🟡, etc) and specifically "Status 🔴 DOWN" -> "Status: DOWN"
            // Also generic emoji removal range
            let clean = advice.replace(/Status\s*[\u{1F534}\u{1F535}\u{1F7E0}-\u{1F7E4}\u{2B50}-\u{2B55}]+\s*DOWN/gu, 'Status: DOWN');
            
            // Remove all emojis broadly if they cause issues
            clean = clean.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
            
            return clean;
        },
        cleanUrl(url: string) {
             if (!url) return '';
             // Fix user-reported spacing gaps "domain .com"
             return url.replace(/\s*\.\s*/g, '.').trim();
        },
        formatDate(dateStr: string) {
            return dayjs(dateStr).format("MMMM D, YYYY");
        },
        formatDateShort(dateStr: string) {
            return dayjs(dateStr).format("MMM D");
        },
        formatTime(dateStr: string) {
            return dayjs(dateStr).format("HH:mm:ss");
        },
        getUptimeColorClass(uptime: number) {
            // Using branding colors implicitly or standard class mappings with extended overrides
            if (!uptime) {
                return "text-liquid-lava";
            }
            if (uptime >= 0.99) {
                return "text-success";
            } // Mapped to green
            if (uptime >= 0.95) {
                return "text-warning";
            }
            return "text-liquid-lava";
        },
        getUptimeColor(uptime: number) {
            if (uptime >= 0.99) {
                return "#28a745";
            } // Success Green (Standard)
            if (uptime >= 0.95) {
                return "#d97706";
            } // Warning
            return "#FD7912"; // Liquid Lava
        },
        getSSLColorClass(days: any) {
            if (days === "N/A" || !days) {
                return "border-secondary";
            }
            return days > 30 ? "ssl-good" : "ssl-bad";
        }
    }
};
</script>

<style scoped lang="scss">
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Roboto+Slab:wght@100..900&display=swap');

// --- AGENCY VARS ---
$liquid-lava: #FD7912;
$taupe: #646D77;
$light-grey: #979BA8;
$obsidian-blue: #0C1422;
$obsidian-eclipse: #121E34;
$obsidian-tide: #1C3765;
$black: #010101;
$white: #FFFFFF;
$dark-orange: #BC580A;

.agency-theme {
    background: $white;
    width: 100%;
    max-width: 100%;
    color: $black;
    line-height: 1.5;
}

// Utility for Wrapping
.wrap-text {
    overflow-wrap: break-word;
    word-wrap: break-word;
    word-break: break-word;
    hyphens: auto;
}

// Monitor Section Pagination - Force new page between monitors
.monitor-report-section {
    page-break-after: always;
    break-after: page;
    display: block;
    overflow: hidden; /* Prevent margin leak creating blank pages */
}

/* Use explicit class because :last-child is the Footer, not the last monitor */
.monitor-report-section.last-monitor {
    page-break-after: auto !important;
    break-after: auto !important;
    margin-bottom: 0;
}

// Avoid page breaks inside important elements
.avoid-break {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
}

// Typography Classes
.font-slab { font-family: 'Roboto Slab', serif; }
.font-inter { font-family: 'Inter', sans-serif; }

// Color Classes
.text-liquid-lava { color: $liquid-lava !important; }
.text-obsidian-blue { color: $obsidian-blue !important; }
.text-obsidian-eclipse { color: $obsidian-eclipse !important; }
.text-obsidian-tide { color: $obsidian-tide !important; }
.text-taupe { color: $taupe !important; }
.text-dark-orange { color: $dark-orange !important; }

.bg-obsidian-blue { background-color: $obsidian-blue !important; }

// Headers
.report-title {
    font-family: 'Roboto Slab', serif;
    font-size: 22px;
    font-weight: 700;
    color: $taupe;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 1.2px;
}

.section-label {
    font-size: 12px;
    letter-spacing: 1.5px;
    font-weight: 700;
    color: $taupe;
    text-transform: uppercase;
    border-left: 4px solid $liquid-lava;
    padding-left: 12px;
}

// Logo & Header
.brand-logo {
    height: 80px;
    object-fit: contain;
}

.url-bar {
    background: linear-gradient(90deg, #0C1422 0%, #1C3765 100%);
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    letter-spacing: 0 !important;
    word-spacing: normal !important;
    white-space: nowrap !important;
    text-align: center !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    position: relative;
    z-index: 10;
}

// Metric Grid
.metrics-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 15px;
}

.metric-card {
    background: $white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 15px 10px;
    text-align: center;
    page-break-inside: avoid !important;
    break-inside: avoid !important;

    .metric-label {
        font-size: 11px;
        color: $taupe;
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 5px;
    }

    .metric-value {
        font-size: 20px;
        font-weight: 800;
        color: $obsidian-eclipse;
        line-height: 1.2;
    }

    .metric-sub {
        font-size: 10px;
        color: $light-grey;
        margin-top: 4px;
    }
}

// Custom Colors Overrides for Logic
.text-success { color: #059669 !important; }
.text-warning { color: $dark-orange !important; }

.ssl-good { border-bottom: 3px solid #059669; }
.ssl-bad { border-bottom: 3px solid $liquid-lava; }

// Custom Table
.custom-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    table-layout: fixed; /* Fix layout for text wrapping */

    th {
        font-weight: 700;
        text-transform: uppercase;
        color: $obsidian-blue;
        background: #f9fafb;
        padding: 10px;
        border-bottom: 2px solid #e5e7eb;
        text-align: left;
    }

    td {
        padding: 12px 10px;
        border-bottom: 1px solid #f3f4f6;
        vertical-align: top;
        overflow-wrap: break-word; /* Ensure wrapping */
    }

    tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    tr:last-child td { border-bottom: none; }
}

// Badges
.badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;

    &.badge-success { background: #d1fae5; color: #065f46; }
    &.badge-warning { background: #fef3c7; color: #92400e; }
    &.badge-error { background: #fee2e2; color: #b91c1c; }
}

</style>
