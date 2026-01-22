<template>
    <div class="modal fade" id="embedWidgetDialog" tabindex="-1" aria-labelledby="embedWidgetDialogLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="embedWidgetDialogLabel">{{ $t("Embed Status Widget") }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>{{ $t("Display your system status on your own website or dashboard using this widget.") }}</p>

                    <ul class="nav nav-tabs mb-3">
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: widgetType === 'badge' }" href="#" @click.prevent="widgetType = 'badge'">{{ $t("Standard Badge") }}</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: widgetType === 'card' }" href="#" @click.prevent="widgetType = 'card'">{{ $t("Premium Card") }}</a>
                        </li>
                    </ul>

                    <div class="row">
                        <div class="col-md-6">
                            <!-- Preview -->
                            <div class="card mb-3">
                                <div class="card-header">{{ $t("Preview") }}</div>
                                <div v-if="widgetType === 'badge'" class="card-body text-center d-flex align-items-center justify-content-center" style="min-height: 100px; background-color: #f8f9fa;">
                                    <img :src="badgeURL" alt="Status Badge" />
                                </div>
                                 <div v-else class="card-body p-0" style="height: 200px; overflow: hidden; position: relative;">
                                    <iframe :src="cardWidgetURL" width="100%" height="100%" frameborder="0" style="pointer-events: none;"></iframe>
                                </div>
                            </div>
                            
                            <!-- Options -->
                            <div v-if="widgetType === 'badge'" class="mb-3">
                                <label class="form-label">{{ $t("Style") }}</label>
                                <select v-model="style" class="form-select">
                                    <option value="flat">Flat</option>
                                    <option value="flat-square">Flat Square</option>
                                    <option value="for-the-badge">For The Badge</option>
                                    <option value="plastic">Plastic</option>
                                    <option value="social">Social</option>
                                </select>
                            </div>
                        </div>

                        <div class="col-md-6">
                            <!-- Code Output -->
                             <div v-if="widgetType === 'badge'">
                                <div class="mb-3">
                                    <label class="form-label">HTML {{ $t("Code") }}</label>
                                    <CopyableInput :value="htmlCode" type="textarea" :rows="3" />
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">Markdown</label>
                                    <CopyableInput :value="markdownCode" type="textarea" :rows="3" />
                                </div>
                            </div>
                            
                            <div v-if="widgetType === 'card'">
                                <div class="mb-3">
                                    <label class="form-label">IFrame {{ $t("Code") }}</label>
                                    <CopyableInput :value="iframeCode" type="textarea" :rows="5" />
                                    <div class="form-text">
                                        Copy and paste this code into your website's HTML where you want the Status Card to appear.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">{{ $t("Close") }}</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { Modal } from "bootstrap";
import CopyableInput from "./CopyableInput.vue";

export default {
    components: {
        CopyableInput
    },
    props: {
        slug: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            modal: null,
            style: "flat-square",
            label: "System Status",
            widgetType: "badge", // 'badge' or 'card'
        };
    },
    computed: {
        baseURL() {
            // Get current origin
            return window.location.origin;
        },
        badgeURL() {
            const params = new URLSearchParams();
            params.append("style", this.style);
            // param 'label' can be added if we want to customize text
            // params.append("label", this.label); 
            
            return `${this.baseURL}/api/status-page/${this.slug}/badge?${params.toString()}`;
        },
        cardWidgetURL() {
            return `${this.baseURL}/status/${this.slug}/widget`;
        },
        statusPageURL() {
             return `${this.baseURL}/status/${this.slug}`;
        },
        htmlCode() {
            return `<a href="${this.statusPageURL}"><img src="${this.badgeURL}" alt="System Status"></a>`;
        },
        markdownCode() {
            return `[![System Status](${this.badgeURL})](${this.statusPageURL})`;
        },
        iframeCode() {
            return `<iframe src="${this.cardWidgetURL}" width="350" height="200" frameborder="0" scrolling="no" style="border: none; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);"></iframe>`;
        }
    },
    mounted() {
        this.modal = new Modal(document.getElementById("embedWidgetDialog"));
    },
    methods: {
        show() {
            this.modal.show();
        }
    }
};
</script>
