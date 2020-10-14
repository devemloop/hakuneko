/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* eslint-disable no-prototype-builtins */

/**
 * Handle image load errors
 */
function imgError(image) {
    if (!image.hasOwnProperty("retryCount")) {
        image.retryCount = 0;
    }

    if (image.retryCount < 3) {
        setTimeout(function () {
            image.src += "?" + +new Date();
            image.retryCount += 1;
        }, 1000);
    }
}

class HakunekoPages extends Polymer.Element {
    /**
     *
     */
    static get is() {
        return "hakuneko-pages";
    }

    /**
     *
     */
    static get properties() {
        return {
            selectedChapter: {
                type: Object,
                value: undefined,
                observer: "onSelectedChapterChanged",
            },
            selectedMedia: {
                type: Number,
                value: -1,
                notify: true, // enable upward data flow
                //readOnly: true // prevent downward data flow
            },
        };
    }

    /**
     *
     */
    ready() {
        super.ready();
        this.media = undefined;
        this.selectedMedia = -1;
        this.selectedSubtitle = -1;
        this.imageWidth = 75;
        this.imagePadding = 2;
        this.hls = undefined;
        this.ass = undefined;
        this.videoResizeObserver = new ResizeObserver(
            this.onVideoResized.bind(this)
        );
        this.autoNextChapter = false;
        this.orientation = 'vertical'
    }
    /**
     *
     */
    getPage(value) {
        return value + 1;
    }
    /**
     *
     */
    onKeyDown(event) {
        switch (true) {
            case event.code === "ArrowUp" && !event.ctrlKey:
                scrollSmoothly(this.$.container, -64);
                break;
            case event.code === "ArrowDown" && !event.ctrlKey:
                scrollSmoothly(this.$.container, 64);
                break;
            case event.code === "PageUp" && !event.ctrlKey:
                this.$.container.scrollBy({
                    top: -window.innerHeight * 0.95,
                    left: 0,
                    behavior: "smooth",
                });
                break;
            case event.code === "PageDown" && !event.ctrlKey:
                this.$.container.scrollBy({
                    top: window.innerHeight * 0.95,
                    left: 0,
                    behavior: "smooth",
                });
                break;
            case event.code === "ArrowRight" && !event.ctrlKey:
                this.requestChapterUp(event);
                break;
            case event.code === "ArrowLeft" && !event.ctrlKey:
                this.requestChapterDown(event);
                break;
            case event.key === "*" && !event.ctrlKey:
                this.imageWidth = 100;
                break;
            case event.key === "/" && !event.ctrlKey:
                this.imageWidth = 75;
                break;
            case event.key === "+" && !event.ctrlKey:
                this.zoomIn(event);
                break;
            case event.key === "-" && !event.ctrlKey:
                this.zoomOut(event);
                break;
            case event.key === "+" && event.ctrlKey:
                this.increaseImagePadding(event);
                break;
            case event.key === "-" && event.ctrlKey:
                this.decreaseImagePadding(event);
                break;
            case event.code === "Escape" && !event.ctrlKey:
                this.hideViewer(event);
                break;
            case event.code === "Space" && !event.ctrlKey:
                this.scrollMagic(window.innerHeight * 0.8);
                break;
            default:
                break;
        }
    }

    /**
     * Observer will be executed, whenever the 'selectedChapter' is changed.
     */
    onSelectedChapterChanged(chapter) {
        this.set("media", undefined);
        if (!chapter) {
            return;
        }
        // TODO: abort any pending page request (maybe store current request in global variable?)
        chapter.getPages((error, media) => {
            if (chapter === this.selectedChapter) {
                this.set("media", media);
                if (error) {
                    alert(error.message);
                }
                // scroll to first page when chapter was changed
                if (this.selectedMedia > -1) {
                    this.set("selectedMedia", 0);
                }
            }
        });
        this.resetSubtitles(true);
    }

    /**
     *
     */
    resetSubtitles(clearTracks) {
        this.selectedSubtitle = -1;
        if (this.ass) {
            this.ass.destroy();
            this.ass = undefined;
        }
        if (clearTracks) {
            let element = this.shadowRoot.querySelector("#video");
            if (element) {
                let tracks = element.textTracks;
                let i = 0;
                while (tracks[i]) {
                    tracks[i].mode = "disabled";
                    i++;
                }
                tracks.onchange = this.onSelectedSubtitleChanged.bind(this);
            }
        }
    }

    /**
     *
     */
    toggleFullscreen(event) {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this.shadowRoot.querySelector("#fullscreen").requestFullscreen();
        }
        event.preventDefault();
        return false;
    }

    /**
     *
     */
    onSelectedSubtitleChanged(event) {
        // Yield with timeout, so UI element can be attached to DOM and update its properties before we access it ...
        setTimeout(() => {
            let video = this.shadowRoot.querySelector("#video");
            // assumption: tracks are in same order as subtitles ...
            let subtitle = [...event.target].findIndex(
                (track) => track.mode === "showing"
            );
            if (this.selectedSubtitle !== subtitle) {
                this.resetSubtitles(false); // NOTE: this will also set this.selectedSubtitle to -1
                this.selectedSubtitle = subtitle;
                if (subtitle > -1) {
                    let sub = this.media.subtitles[this.selectedSubtitle];
                    if (sub.content) {
                        this.ass = new ASS(sub.content, video);
                    } else {
                        fetch(sub.url)
                            .then((response) => {
                                if (response.status !== 200) {
                                    throw new Error();
                                }
                                return response.text();
                            })
                            .then((data) => {
                                sub.content = data;
                                this.ass = new ASS(sub.content, video);
                            })
                            .catch((error) => {
                                console.warn(error, sub.url);
                            });
                    }
                }
            }
        }, 250);
    }

    /**
     *
     */
    showViewer(event) {
        this.set("selectedMedia", event.model.index);
        this.set("viewerStyle.bgImage", this.media[this.selectedMedia]);
    }

    /**
     *
     */
    hideViewer(event) {
        this.set("selectedMedia", -1);
        Engine.ChaptermarkManager.addChaptermark(this.selectedChapter);
    }

    /**
     *
     */
    getContainerColor(selectedMedia) {
        return selectedMedia > -1
            ? "var(--page-reader-background-color)"
            : "var(--page-control-background-color)";
    }

    /**
     *
     */
    thumbnailViewMode(media, selectedMedia) {
        return media && media.length && selectedMedia < 0;
    }

    /**
     *
     */
    pageViewMode(media, selectedMedia) {
        if (media instanceof Array) {
            // embed in timeout function to ensure image layout is updated before adjusting scroll offsetTop
            setTimeout(() => {
                if (this.selectedMedia > -1) {
                    this.$.container.scrollTop = this.$.container.querySelector(
                        "#page_" + this.selectedMedia
                    ).offsetTop;
                    this.$.container.querySelector("#buttons").focus();
                } else {
                    this.$.container.scrollTop = 0;
                }
            }, 0);
        }
        return media instanceof Array && selectedMedia > -1;
    }

    /**
     *
     */
    videoViewMode(media, selectedMedia) {
        return (
            media &&
            (media.mirrors instanceof Array || typeof media.video === "string")
        );
    }

    /**
     *
     */
    escapeBackgroundURI(uri) {
        return uri.replace(/'/g, "\\'");
    }

    /**
     *
     */
    onVideoElementChanged(event) {
        this.resetSubtitles(true);
        let element = this.shadowRoot.querySelector("#video");
        //console.log( 'VIDEO', element, element.querySelector( 'input::-webkit-media-controls-toggle-closed-captions-button' ) );
        if (element) {
            element.pause();
            // destroying seems the only way to flush buffers and prevent packets from the previous stream being played
            if (this.hls) {
                this.hls.destroy();
            }
            element.src = "";
            if (this.media && this.media.mirrors) {
                // TODO: select random mirror?
                this.hls = new Hls();
                this.hls.attachMedia(element);
                this.hls.loadSource(this.media.mirrors[0]);
            }
            if (this.media && this.media.video) {
                element.src = this.media.video;
            }
            this.videoResizeObserver.observe(element);
        }
    }

    /**
     *
     */
    onVideoResized(e) {
        if (this.ass) {
            this.ass.resize();
        }
    }

    /**
     * fire event to request the next chapter
     */
    requestChapterUp(event) {
        this.autoNextChapter = false;
        window.dispatchEvent(
            new CustomEvent("chapterUp", { detail: this.selectedChapter })
        );
    }

    /**
     * fire event to request the previous chapter
     */
    requestChapterDown(event) {
        window.dispatchEvent(
            new CustomEvent("chapterDown", { detail: this.selectedChapter })
        );
    }

    /**
     *
     */
    decreaseImagePadding(event) {
        this.setImagePadding(this.imagePadding - 1);
    }

    /**
     *
     */
    increaseImagePadding(event) {
        this.setImagePadding(this.imagePadding + 1);
    }

    /**
     *
     */
    setImagePadding(padding) {
        let offset = this.$.container.scrollTop / this.$.container.scrollHeight;
        this.set("imagePadding", Math.max(0, padding));
        /*
                // embed in timeout function to ensure image layout is updated before adjusting scroll offsetTop
                setTimeout( () => {
                    this.$.container.scrollTop = offset * this.$.container.scrollHeight;
                }, 0 );
                */
        this.$.container.scrollTop = offset * this.$.container.scrollHeight;
    }

    /**
     *
     */
    zoomIn(event) {
        let scale = this.imageWidth + 15;
        this.zoom(scale > 400 ? 400 : scale);
    }

    /**
     *
     */
    zoomOut(event) {
        let scale = this.imageWidth - 15;
        this.zoom(scale < 25 ? 25 : scale);
    }

    /**
     *
     */
    zoom(scale) {
        let previousHeight = this.$.container.scrollHeight;
        let previousOffset = this.$.container.scrollTop;
        this.set("imageWidth", scale);
        // embed in timeout function to ensure layout is updated before adjusting offsetY
        //setTimeout( function() {
        // adjust new offsetY depending on height changed ratio of container after scaling images
        this.$.container.scrollTop =
            (previousOffset * this.$.container.scrollHeight) / previousHeight;
        //}.bind( this ), 0 );
    }

    /**
     * Dynamically change the scrolling to stop at the end of images or skip to the start of the next image
     * Usefull for manga reading but ugly with webtoons
     */
    scrollMagic(defaultDistance) {
        let images = this.$.container.querySelectorAll(".image");
        // Are we at the end of the page
        if (
            images[images.length - 1].getBoundingClientRect().bottom -
                window.innerHeight <
            1
        ) {
            // Should we go to next chapter because we previouysly reached the end of page ?
            if (this.autoNextChapter) {
                return this.requestChapterUp();
            }
            // Prepare for next chapter
            this.autoNextChapter = true;
            // Todo: Find a way to popup that you have to press spacebar again within 4s
            setTimeout(function () {
                this.autoNextChapter = false;
            }, 4000);
            return;
        }
        // Lets stay on current page
        // Find current image within view
        let targetScrollImages = [...images].filter((image) => {
            let rect = image.getBoundingClientRect();
            return rect.top <= window.innerHeight && rect.bottom > 1;
        });

        // If multiple images filtered, get the last one. If none scroll use the top image
        let targetScrollImage =
            targetScrollImages[targetScrollImages.length - 1] || images[0];

        // Is the target image top within view ? then scroll to the top of it
        if (targetScrollImage.getBoundingClientRect().top > 1) {
            // Scroll to it
            targetScrollImage.scrollIntoView({
                behavior: "smooth",
            });
        }
        // Do we stay within target ? (bottom is further than current view)
        else if (
            window.innerHeight + 1 <
            targetScrollImage.getBoundingClientRect().bottom
        ) {
            this.$.container.scrollBy({
                top: Math.min(
                    defaultDistance,
                    targetScrollImage.getBoundingClientRect().bottom -
                        window.innerHeight
                ),
                left: 0,
                behavior: "smooth",
            });
        }
        // We have to try to get to next image
        else {
            // Find next image
            let nextScrollImage = targetScrollImage.nextElementSibling;
            // Scroll to it
            nextScrollImage.scrollIntoView({
                behavior: "smooth",
            });
        }
    }
}

window.customElements.define(HakunekoPages.is, HakunekoPages);

function scrollSmoothly(element, distance) {
    const speed = Math.abs(Math.floor(distance / 10)),
        end = Math.abs(distance % speed);
    function doTinyScroll() {
        if (Math.abs(distance) == end) return;
        else if (distance > 0) {
            element.scrollBy({
                top: speed,
            });
            distance -= speed;
        } else {
            element.scrollBy({
                top: -speed,
            });
            distance += speed;
        }
        window.requestAnimationFrame(doTinyScroll);
    }
    window.requestAnimationFrame(doTinyScroll);
}
