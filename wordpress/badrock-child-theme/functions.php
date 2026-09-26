<?php
/**
 * Badrockplyr Child Theme - Master Functions
 * 
 * Seamlessly integrates Badrockplyr PRO REST API into WordPress:
 * - Admin settings panel to configure Badrock API URL and API Key
 * - IMDb / TMDb auto-import metabox on Movies, Series, and Posts
 * - Responsive embed player & VIP server tabs
 * - Option to override/disable theme native IMDb inputs to avoid conflicts
 */

if (!defined('ABSPATH')) {
    exit;
}

define('BADROCK_THEME_VERSION', '2.0.0');
define('BADROCK_THEME_DIR', get_stylesheet_directory());
define('BADROCK_THEME_URI', get_stylesheet_directory_uri());

// Enqueue styles
add_action('wp_enqueue_scripts', 'badrock_enqueue_styles');
function badrock_enqueue_styles() {
    wp_enqueue_style('badrock-parent-style', get_template_directory_uri() . '/style.css');
    wp_enqueue_style('badrock-child-style', get_stylesheet_uri(), array('badrock-parent-style'), BADROCK_THEME_VERSION);
    
    // Custom Player Switcher Script
    wp_enqueue_script(
        'badrock-player-switcher',
        BADROCK_THEME_URI . '/inc/player-switcher.js',
        array('jquery'),
        BADROCK_THEME_VERSION,
        true
    );
}

// Load Modules
require_once BADROCK_THEME_DIR . '/inc/admin-settings.php';
require_once BADROCK_THEME_DIR . '/inc/imdb-importer.php';
require_once BADROCK_THEME_DIR . '/inc/player-render.php';
