/**
 * @fileoverview X (Twitter) 去广告脚本
 * @author 综合网络资源整理
 * @description 移除X/Twitter时间线广告、推荐用户、推广内容、赞助标签等
 * @version 1.0.0
 * 
 * 支持的Loon版本: >= 2.1.0
 * 需要的权限: requires-body=1
 */

const $ = new LoonScript();
const DEBUG = false;

// ========== 配置参数 (通过BoxJs或其他方式配置) ==========
const config = {
    removePromotedTweets: true,     // 移除推广推文
    removeRecommendedUsers: true,   // 移除推荐用户
    removeSponsoredTags: true,      // 移除视频/GIF赞助标签
    removeSuggestedTopics: true,    // 移除建议话题
    removeWhoToFollow: true,        // 移除"关注谁"模块
    removePromotedUsers: true,      // 移除推广用户
    removePreRollAds: true,         // 移除视频前贴广告
    removeTrends: false,            // 移除"为你推荐"趋势 (可选)
    removeTrackingParams: true,      // 移除链接追踪参数
};

// 广告相关标识
const AD_IDENTIFIERS = [
    'promoted',
    'Promoted',
    'sponsored',
    'Sponsored',
    'uwt_',  // 推广推文ID前缀
    '__iad', // 推广内容标识
    'ad_unit',
    'impression_pings',
    'promoted_by',
    'advertiser',
    'promoted_tweet',
    'promoted_metadata',
    'pc_promoted',
    'toast_promoted',
    'sponsored_',
];

// 用户推荐相关标识
const RECOMMENDATION_IDENTIFIERS = [
    'who_to_follow',
    'whoToFollow',
    'recommended_users',
    'recommendedUsers',
    'similar_to',
    'related_users',
    'connect_people',
    'suggested_users',
    'user_recommendations',
    'topic_recommendations',
    'to_follow',
];

// 趋势/话题标识
const TREND_IDENTIFIERS = [
    'promoted_trend',
    'suggested_trend',
    'sponsored_trend',
];

// 广告实体类型
const AD_ENTRY_TYPES = [
    'TimelineTimelineAdCard',
    'OrganicTim
elineAd',
    'TimelineTrend',
    'TimelineTopic',
    'SuggestedUsersModule',
    'WhoToFollow',
    'ExploreRecommendations',
    'SuggestedTopic',
    'PromotedUser',
];

/**
 * 主入口函数
 */
function main() {
    try {
        const url = $request.url;
        const body = $response.body;
        
        if (!body) {
            $done({});
            return;
        }
        
        let responseBody = JSON.parse(body);
        
        // 根据URL判断处理类型
        if (url.includes('/timeline') || url.includes('HomeTimeline')) {
            responseBody = processTimeline(responseBody);
        } else if (url.includes('/search')) {
            responseBody = processSearch(responseBody);
        } else if (url.includes('/notifications')) {
            responseBody = processNotifications(responseBody);
        } else if (url.includes('/topics') || url.includes('/trends')) {
            responseBody = processTopics(responseBody);
        } else if (url.includes('/users/recommendations')) {
            responseBody = processRecommendations(responseBody);
        } else {
            responseBody = processGeneric(responseBody);
        }
        
        // 转换回字符串并返回
        const modifiedBody = JSON.stringify(responseBody);
        
        if (DEBUG) {
            console.log(`[X Ad Remover] Modified response for: ${url}`);
        }
        
        $done({ body: modifiedBody });
        
    } catch (error) {
        console.log(`[X Ad Remover] Error: ${error.message}`);
        $done({});
    }
}

/**
 * 处理时间线响应
 */
function processTimeline(data) {
    // 处理GraphQL响应
    if (data.data?.home?.home_timeline_urt?.instructions) {
        const instructions = data.data.home.home_timeline_urt.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
            if (instruction.entry) {
                instruction.entry = filterSingleEntry(instruction.entry);
            }
        }
    }
    
    // 处理旧版API响应
    if (data.globalObjects?.tweets) {
        data.globalObjects.tweets = filterTweets(data.globalObjects.tweets);
    }
    
    // 处理列表时间线
    if (data.data?.list?.tweets_timeline?.timeline) {
        const timeline = data.data.list.tweets_timeline.timeline;
        if (timeline.instructions) {
            for (let instruction of timeline.instructions) {
                if (instruction.entries) {
                    instruction.entries = filterTimelineEntries(instruction.entries);
                }
            }
        }
    }
    
    // 处理用户时间线
    if (data.data?.user?.result?.timeline_v2?.timeline?.instructions) {
        const instructions = data.data.user.result.timeline_v2.timeline.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
        }
    }
    
    // 处理 bookmarks
    if (data.data?.bookmark_timeline_v2?.timeline?.instructions) {
        const instructions = data.data.bookmark_timeline_v2.timeline.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
        }
    }
    
    return data;
}

/**
 * 过滤时间线条目
 */
function filterTimelineEntries(entries) {
    if (!Array.isArray(entries)) return entries;
    
    return entries.filter(entry => {
        // 检查条目类型
        if (isAdEntry(entry)) {
            if (DEBUG) console.log('[X Ad Remover] Filtered ad entry:', entry.entryId);
            return false;
        }
        
        // 检查推荐用户模块
        if (config.removeRecommendedUsers && isRecommendationEntry(entry)) {
            if (DEBUG) console.log('[X Ad Remover] Filtered recommendation entry:', entry.entryId);
            return false;
        }
        
        // 深度处理嵌套内容
        if (entry.content?.itemContent?.tweet_results?.result) {
            entry.content.itemContent.tweet_results.result = cleanTweet(entry.content.itemContent.tweet_results.result);
        }
        
        return true;
    });
}

/**
 * 处理单个条目
 */
function filterSingleEntry(entry) {
    if (!entry) return null;
    
    if (isAdEntry(entry) || (config.removeRecommendedUsers && isRecommendationEntry(entry))) {
        return null;
    }
    
    return entry;
}

/**
 * 判断是否为广告条目
 */
function isAdEntry(entry) {
    if (!entry) return false;
    
    const entryId = entry.entryId || '';
    const content = entry.content || {};
    
    // 检查条目ID前缀
    const adPrefixes = [
        'promoted-', 'pc-', 'ad-', 'advertiser-',
        'sponsored-', 'trend-', 'topic-',
        'who-to-follow-', 'who_to_follow_',
        'similar-to-', 'related-users-'
    ];
    
    for (let prefix of adPrefixes) {
        if (entryId.startsWith(prefix)) return true;
    }
    
    // 检查条目类型
    const entryType = content.entryType || '';
    if (AD_ENTRY_TYPES.some(type => entryType.includes(type))) return true;
    
    // 检查itemContent
    const itemContent = content.itemContent || {};
    if (itemContent.itemType) {
        if (AD_ENTRY_TYPES.some(type => itemContent.itemType.includes(type))) return true;
    }
    
    // 检查广告元数据
    if (itemContent.tweet_results?.result?.promotedMetadata ||
        itemContent.tweet_results?.result?.line?.items?.[0]?.item?.content?.tombstone?.tombstoneInfo?.richText?.text?.includes('promoted')) {
        return true;
    }
    
    // 检查slices (GraphQL中的广告标记)
    if (entry.slices) {
        for (let slice of entry.slices) {
            if (slice.ad_source?.ad_slot) return true;
        }
    }
    
    return false;
}

/**
 * 判断是否为推荐条目
 */
function isRecommendationEntry(entry) {
    if (!entry) return false;
    
    const entryId = entry.entryId || '';
    const content = entry.content || {};
    
    // 检查推荐标识
    for (let identifier of RECOMMENDATION_IDENTIFIERS) {
        if (entryId.toLowerCase().includes(identifier)) return true;
    }
    
    // 检查条目类型
    const entryType = content.entryType || '';
    if (entryType.includes('User') && entryType.includes('Module')) return true;
    if (entryType.includes('Suggested')) return true;
    
    // 检查itemContent
    const itemContent = content.itemContent || {};
    if (itemContent.users?.length > 0) return true;
    if (itemContent.user_results) return true;
    
    return false;
}

/**
 * 清理推文数据
 */
function cleanTweet(tweet) {
    if (!tweet) return tweet;
    
    // 移除推广元数据
    if (tweet.promotedMetadata) {
        delete tweet.promotedMetadata;
    }
    
    // 移除广告相关字段
    if (tweet.ad_metadata) {
        delete tweet.ad_metadata;
    }
    
    // 清理SC广告
    if (tweet.sc_ad_metadata) {
        delete tweet.sc_ad_metadata;
    }
    
    // 移除赞助标签
    if (config.removeSponsoredTags && tweet.extended_entities?.media) {
        tweet.extended_entities.media = tweet.extended_entities.media.map(media => {
            if (media.additional_media_info?.advertiser_account) {
                delete media.additional_media_info.advertiser_account;
            }
            return media;
        });
    }
    
    return tweet;
}

/**
 * 过滤推文列表
 */
function filterTweets(tweets) {
    if (!tweets || typeof tweets !== 'object') return tweets;
    
    const filtered = {};
    for (let [id, tweet] of Object.entries(tweets)) {
        if (!isAdTweet(tweet)) {
            filtered[id] = cleanTweet(tweet);
        }
    }
    return filtered;
}

/**
 * 判断是否为广告推文
 */
function isAdTweet(tweet) {
    if (!tweet) return false;
    
    // 检查推广标识
    if (tweet.promotedMetadata) return true;
    if (tweet.ad_metadata) return true;
    if (tweet.sc_ad_metadata) return true;
    if (tweet.source && AD_IDENTIFIERS.some(id => tweet.source.includes(id))) return true;
    
    // 检查实体中的广告
    if (tweet.entities?.urls) {
        for (let url of tweet.entities.urls) {
            if (url.url && url.url.includes('t.co') && url.expanded_url?.includes('promoted')) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * 处理搜索响应
 */
function processSearch(data) {
    if (data.globalObjects?.tweets) {
        data.globalObjects.tweets = filterTweets(data.globalObjects.tweets);
    }
    
    // 处理GraphQL搜索
    if (data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions) {
        const instructions = data.data.search_by_raw_query.search_timeline.timeline.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
        }
    }
    
    // 处理GraphQL搜索v2
    if (data.data?.search_by_raw_query?.search_timeline?.timeline_v2?.instructions) {
        const instructions = data.data.search_by_raw_query.search_timeline.timeline_v2.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
        }
    }
    
    return data;
}

/**
 * 处理通知响应
 */
function processNotifications(data) {
    if (data.globalObjects?.tweets) {
        data.globalObjects.tweets = filterTweets(data.globalObjects.tweets);
    }
    
    if (data.notifications) {
        data.notifications = data.notifications.filter(notification => {
            // 过滤推广通知
            if (notification.message?.text?.includes('promoted')) return false;
            return true;
        });
    }
    
    // GraphQL通知
    if (data.data?.viewer?.notifications?.notifications_timeline?.timeline?.instructions) {
        const instructions = data.data.viewer.notifications.notifications_timeline.timeline.instructions;
        for (let instruction of instructions) {
            if (instruction.entries) {
                instruction.entries = filterTimelineEntries(instruction.entries);
            }
        }
    }
    
    return data;
}

/**
 * 处理话题/趋势响应
 */
function processTopics(data) {
    // 移除推广趋势
    if (data.data?.viewer?.explore_v2?.body?.items) {
        data.data.viewer.explore_v2.body.items = data.data.viewer.explore_v2.body.items.filter(item => {
            if (isAdEntry(item.entry)) return false;
            return true;
        });
    }
    
    // 旧版趋势API
    if (data.trends && config.removeTrends) {
        // 可选：完全移除趋势
        delete data.trends;
    }
    
    return data;
}

/**
 * 处理推荐用户响应
 */
function processRecommendations(data) {
    // 如果配置了移除推荐用户，直接返回空
    if (config.removeRecommendedUsers) {
        if (data.recommended_users) {
            data.recommended_users = [];
        }
        if (data.data?.user?.result?.following_timeline?.timeline?.instructions) {
            // 清空推荐指令
            data.data.user.result.following_timeline.timeline.instructions = [];
        }
    }
    
    return data;
}

/**
 * 通用处理
 */
function processGeneric(data) {
    // 递归搜索并清理所有推文
    if (typeof data === 'object') {
        traverseAndClean(data);
    }
    
    return data;
}

/**
 * 递归遍历并清理数据
 */
function traverseAndClean(obj) {
    if (!obj || typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
            if (isAdEntry(obj[i])) {
                obj.splice(i, 1);
            } else {
                traverseAndClean(obj[i]);
            }
        }
    } else {
        // 清理当前对象的推文
        if (obj.tweet_results?.result) {
            obj.tweet_results.result = cleanTweet(obj.tweet_results.result);
        }
        
        for (let key of Object.keys(obj)) {
            if (key === 'tweets' && typeof obj[key] === 'object') {
                obj[key] = filterTweets(obj[key]);
            } else if (key === 'entries' && Array.isArray(obj[key])) {
                obj[key] = filterTimelineEntries(obj[key]);
            } else {
                traverseAndClean(obj[key]);
            }
        }
    }
}

/**
 * Loon 脚本工具类
 */
function LoonScript() {
    this.request = $request;
    this.response = $response;
    
    this.log = function(message) {
        console.log(message);
    };
    
    this.notify = function(title, subtitle, message) {
        $notification.post(title, subtitle, message);
    };
}

// 运行主函数
main();