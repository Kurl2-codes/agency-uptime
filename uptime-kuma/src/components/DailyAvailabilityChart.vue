<template>
    <div class="daily-availability-chart">
        <Bar :data="chartData" :options="chartOptions" />
    </div>
</template>

<script>
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import dayjs from 'dayjs'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default {
    name: 'DailyAvailabilityChart',
    components: {
        Bar
    },
    props: {
        dailyStats: {
            type: Array,
            required: true
        }
    },
    computed: {
        chartData() {
            return {
                labels: this.dailyStats.map(day => dayjs(day.date).format('MMM D')),
                datasets: [
                    {
                        label: this.$t("Availability") + ' (%)',
                        backgroundColor: this.dailyStats.map(day => {
                            if (day.uptime >= 0.99) return '#5cdd8b';
                            if (day.uptime >= 0.95) return '#f8a306';
                            return '#dc3545';
                        }),
                        data: this.dailyStats.map(day => (day.uptime * 100))
                    }
                ]
            }
        },
        chartOptions() {
            return {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Availability (%)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                         callbacks: {
                            label: function(context) {
                                return context.parsed.y.toFixed(2) + '%';
                            }
                        }
                    }
                }
            }
        }
    }
}
</script>

<style scoped>
.daily-availability-chart {
    height: 300px;
    width: 100%;
}
</style>
