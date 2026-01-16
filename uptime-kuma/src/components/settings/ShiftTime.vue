<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="saveSettings">
            <div class="mb-4">
                <label class="form-label">{{ $t("Shift Start Time") }}</label>
                <input
                    v-model="settings.shiftStart"
                    type="time"
                    class="form-control"
                    required
                />
                <div class="form-text">
                    {{ $t("The start time of your shift for reports.") }}
                </div>
            </div>

            <div class="mb-4">
                <label class="form-label">{{ $t("Shift End Time") }}</label>
                <input
                    v-model="settings.shiftEnd"
                    type="time"
                    class="form-control"
                    required
                />
                <div class="form-text">
                    {{ $t("The end time of your shift for reports.") }}
                </div>
            </div>

            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>
export default {
    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
    },
};
</script>
