<?php
/**
 * Badrockplyr Child Theme - Front-End Player Renderer & Shortcode
 */

if (!defined('ABSPATH')) {
    exit;
}

// Shortcode: [badrock_player id="tt15398776" mode="embed_iframe"]
add_shortcode('badrock_player', 'badrock_player_shortcode');
function badrock_player_shortcode($atts) {
    global $post;

    $atts = shortcode_atts(array(
        'id' => '',
        'type' => 'movie',
        'season' => 1,
        'episode' => 1,
        'mode' => ''
    ), $atts, 'badrock_player');

    $post_id = $post ? $post->ID : 0;
    $embed_url = get_post_meta($post_id, '_badrock_embed_url', true);
    $servers_json = get_post_meta($post_id, '_badrock_servers_json', true);
    $servers = !empty($servers_json) ? json_decode($servers_json, true) : array();
    $mode = !empty($atts['mode']) ? $atts['mode'] : get_post_meta($post_id, '_badrock_player_mode', true);
    if (empty($mode)) {
        $mode = get_option('badrock_player_mode', 'embed_iframe');
    }

    // If explicit ID was provided in shortcode attributes, construct embed URL
    if (!empty($atts['id'])) {
        $base_url = rtrim(get_option('badrock_api_url', 'http://localhost:3000'), '/');
        if ($atts['type'] === 'movie') {
            $embed_url = $base_url . '/play/embed/movie/' . urlencode($atts['id']);
        } else {
            $embed_url = $base_url . '/play/embed/tv/' . urlencode($atts['id']) . '/' . intval($atts['season']) . '/' . intval($atts['episode']);
        }
    }

    if (empty($embed_url) && empty($servers)) {
        return '<!-- Badrock Player: No media assigned -->';
    }

    ob_start();
    ?>
    <div class="badrock-player-wrapper" style="margin: 20px 0;">
        <?php if ($mode === 'raw_servers' && !empty($servers)): ?>
            <!-- Raw Servers Multi-tab Selector -->
            <div class="badrock-server-tabs" role="tablist">
                <?php foreach ($servers as $idx => $srv): 
                    $is_vip = !empty($srv['isVip']);
                    $is_active = $idx === 0;
                ?>
                    <button 
                        type="button" 
                        class="badrock-server-btn <?php echo $is_active ? 'active' : ''; ?> <?php echo $is_vip ? 'is-vip' : ''; ?>" 
                        data-url="<?php echo esc_url($srv['url']); ?>"
                        onclick="badrockSwitchServer(this)"
                    >
                        <?php if ($is_vip): ?>⭐<?php else: ?>▶<?php endif; ?>
                        <?php echo esc_html($srv['name']); ?> 
                        <span style="font-size: 10px; opacity: 0.8; font-weight: normal;">(<?php echo esc_html($srv['language']); ?>)</span>
                    </button>
                <?php endforeach; ?>
            </div>

            <div class="badrock-embed-container">
                <iframe id="badrock-active-frame" src="<?php echo esc_url($servers[0]['url']); ?>" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
            </div>

            <script>
            function badrockSwitchServer(btn) {
                const buttons = document.querySelectorAll('.badrock-server-btn');
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const targetUrl = btn.getAttribute('data-url');
                const frame = document.getElementById('badrock-active-frame');
                if (frame && targetUrl) {
                    frame.src = targetUrl;
                }
            }
            </script>
        <?php else: ?>
            <!-- Default Responsive Embed Player -->
            <div class="badrock-embed-container">
                <iframe src="<?php echo esc_url($embed_url); ?>" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"></iframe>
            </div>
        <?php endif; ?>
    </div>
    <?php
    return ob_get_clean();
}

// Auto-inject player on single post views if configured
add_filter('the_content', 'badrock_auto_inject_player');
function badrock_auto_inject_player($content) {
    if (!is_singular() || is_feed() || !in_the_loop() || !is_main_query()) {
        return $content;
    }

    global $post;
    $embed_url = get_post_meta($post->ID, '_badrock_embed_url', true);
    if (!empty($embed_url)) {
        $player_html = do_shortcode('[badrock_player]');
        return $player_html . $content;
    }

    return $content;
}
