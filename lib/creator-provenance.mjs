const FIELD_LABELS = {
  channelId: 'Channel ID', name: 'Channel name', description: 'Description', customUrl: 'Custom URL',
  countryCode: 'Creator-declared country', subscribers: 'Subscriber count', totalViews: 'Total views',
  videoCount: 'Total public videos', publishedAt: 'Channel creation date', thumbnail: 'Thumbnail',
  topicCategories: 'YouTube topic categories', videoId: 'Video ID', title: 'Video title',
  views: 'View count', likes: 'Like count', comments: 'Comment count',
  duration: 'Duration', categoryId: 'YouTube category ID', liveBroadcastContent: 'Live broadcast status',
  playlistId: 'Playlist ID', itemCount: 'Playlist item count',
};

export function fieldProvenance(record, fields, { retrievedAt, method, sourceId, labels = {} }) {
  return Object.fromEntries(fields.map(field => {
    const value = record[field];
    const available = value !== null && value !== undefined && value !== '';
    return [field, {
      label: labels[field] || FIELD_LABELS[field] || field,
      sourceCategory: 'official_source',
      source: 'YouTube Data API',
      sourceId,
      method,
      retrievedAt,
      lastVerifiedAt: retrievedAt,
      verificationStatus: available ? 'retrieved_from_official_api' : 'not_publicly_available',
    }];
  }));
}

export function attachProvenance(record, fields, options) {
  return { ...record, provenance: fieldProvenance(record, fields, options) };
}
