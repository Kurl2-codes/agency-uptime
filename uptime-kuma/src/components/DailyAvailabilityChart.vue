<template>
    <!-- Atlassian-style Uptime Timeline -->
    <div class="daily-availability-chart-container">
        <div class="d-flex justify-content-between align-items-center mb-1">
             <span class="small text-muted fw-bold font-inter">90 Days Uptime History</span>
             <span class="small text-muted font-inter">100%</span>
        </div>
        <div class="daily-availability-chart d-flex align-items-end w-100" style="gap: 2px;">
            <div 
                v-for="(day, index) in dailyStats" 
                :key="index"
                class="uptime-bar"
                :class="getBarClass(day.uptime)"
                :style="{ backgroundColor: getBarColor(day.uptime) }"
                :title="formatTooltip(day)"
            ></div>
        </div>
    </div>
</template>

<script>
import dayjs from "dayjs";

export default {
    name: "DailyAvailabilityChart",
    props: {
        dailyStats: {
            type: Array,
            required: true
        }
    },
    methods: {
        getBarColor(uptime) {
             // Atlassian-like colors
             // Green (High Uptime)
             if (uptime >= 0.99) return "#10b981"; 
             // Orange (Degraded)
             if (uptime >= 0.90) return "#f59e0b"; 
             // Red (Outage)
             return "#ef4444"; 
        },
        getBarClass(uptime) {
            return ""; 
        },
        formatTooltip(day) {
            return `${dayjs(day.date).format("MMM D")}: ${(day.uptime * 100).toFixed(2)}%`;
        }
    }
};
</script>

<style scoped>
.daily-availability-chart-container {
    width: 100%;
    /* Let parent control height, but this inner part handles the bars */
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.daily-availability-chart {
    height: 34px; /* Fixed height for the bars like the screenshot */
    width: 100%;
}

.uptime-bar {
    flex: 1;
    height: 100%;
    min-width: 3px;
    border-radius: 2px;
    transition: opacity 0.2s;
}

.uptime-bar:hover {
    opacity: 0.8;
}
</style>
