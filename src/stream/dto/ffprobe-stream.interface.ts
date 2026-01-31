export interface FFProbeStream {
    index: number;
    codec_type: 'video' | 'audio' | 'subtitle';
    tags?: {
        language?: string;
    };
}