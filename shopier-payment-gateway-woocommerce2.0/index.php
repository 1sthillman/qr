<?php

/*
Plugin Name: WooCommerce Pay with Credit Card
Plugin URI: https://www.shopier.com
Description: Pay with Credit Card for woocommerce
Version: 2.0.0
Author: Shopier
Author URI: https://www.shopier.com
*/

add_action('plugins_loaded', 'woocommerce_shopier_init', 0);
function woocommerce_shopier_init()
{

    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }


    class WC_Shopier extends WC_Payment_Gateway
    {
        private function saveText($text)
        {
            $text = str_replace("'", '&apos;', $text);
            $text = str_replace('"', '&quot;', $text);
            $text = str_replace(">", '&gt;', $text);
            $text = str_replace("<", '&lt;', $text);
            $text = str_replace("&", '&amp;', $text);
            return $text;
        }

        public function __construct()
        {
            $this->id = 'shopier';
            $this->method_title = $this->getLangText('Pay with Credit Card');
            $this->has_fields = false;

            $this->init_form_fields();
            $this->init_settings();

            $this->title = $this->settings['title'];
            $this->description = $this->settings['description'];
            $this->api_key = $this->settings['api_key'];
            $this->secret = $this->settings['secret'];
            $this->payment_endpoint_url = $this->settings['payment_endpoint_url'];
            $this->website_index = $this->settings['website_index'];
            $this->use_adress = $this->settings['use_adress'];
            $this->msg['message'] = "";
            $this->msg['class'] = "";

            if (version_compare(WOOCOMMERCE_VERSION, '2.0.0', '>=')) {
                add_action('woocommerce_update_options_payment_gateways_' . $this->id, array(&$this, 'process_admin_options'));
            } else {
                add_action('woocommerce_update_options_payment_gateways', array(&$this, 'process_admin_options'));
            }

            $this->callback = home_url('/wc-api/WC_Shopier');

            add_action('woocommerce_api_wc_shopier', array(&$this, 'check_shopier_response'));
            add_action('woocommerce_receipt_shopier', array(&$this, 'receipt_page'));
        }

        public function getLangText($text)
        {
            if (!isset($this->shopierText)) {
                $lang = trim(get_bloginfo("language"));
                $lang_file = __DIR__ . "/lang/{$lang}.php";
                if (!file_exists($lang_file)) {
                    $lang_file = __DIR__ . "/lang/en-US.php";
                }
                require_once($lang_file);
                $this->shopierText = $shopierText;
            }
            if (isset($this->shopierText[$text]) && !empty($this->shopierText[$text])) {
                return $this->shopierText[$text];
            } else {
                return $text;
            }
        }

        public function init_form_fields()
        {
            $this->form_fields = array(
                'enabled' => array(
                    'title' => $this->getLangText('Enable/Disable'),
                    'type' => 'checkbox',
                    'label' => $this->getLangText('Enable Shopier Module'),
                    'default' => 'no'
                ),
                'title' => array(
                    'title' => $this->getLangText('Title:'),
                    'type' => 'text',
                    'description' => $this->getLangText('This controls the title which the user sees during checkout.'),
                    'default' => $this->getLangText('Pay with Credit Card')
                ),
                'description' => array(
                    'title' => $this->getLangText('Description:'),
                    'type' => 'textarea',
                    'description' => $this->getLangText('This controls the description which the user sees during checkout.'),
                    'default' => $this->getLangText('Pay securely by Shopier Module.')
                ),
                'api_key' => array(
                    'title' => $this->getLangText('API Key'),
                    'type' => 'text',
                    'description' => $this->getLangText('This obtained by user from Shopier panel')
                ),
                'secret' => array(
                    'title' => $this->getLangText('Secret'),
                    'type' => 'password',
                    'description' => $this->getLangText('This obtained by user from Shopier panel'),
                ),
                'payment_endpoint_url' => array(
                    'title' => $this->getLangText('Payment Endpoint URL'),
                    'type' => 'text',
                    'default' => $this->getLangText('https://www.shopier.com/ShowProduct/api_pay4.php'),
                    'description' => $this->getLangText('In standard usage, you don\'t need to change this field.')
                ),

                'website_index' => array(
                    'title' => $this->getLangText('Website Index'),
                    'type' => 'text',
                    'description' => $this->getLangText('If you are only using it on one site, this field should be 1. If you use more than 1 site, follow the setup guide for setting this field.'),
                    'default' => $this->getLangText('1')
                ),
                'use_adress' => array(
                    'title' => $this->getLangText('Use Adress'),
                    'type' => 'select',
                    'options' => array
                    (
                        $this->getLangText('Use Billing Address'),
                        $this->getLangText('Use Delivery Address')
                    )
                ),
                'callback' => array(
                    'title' => $this->getLangText('Response URL'),
                    'type' => 'hidden',
                    'description' => '<span style="margin-top: -17px; position: absolute;">' . $this->getLangText('Please paste this URL in your Shopier panel (Integrations-> Module Management page):') . ' <strong>' . home_url('/wc-api/WC_Shopier') . '</strong></span>',
                ),
            );
        }

        public function admin_options()
        {
            echo '<h3>' . $this->getLangText('Shopier Module') . '</h3>';
            echo '<table class="form-table">';
            $this->generate_settings_html();
            echo '</table>';
        }

        public function payment_fields()
        {
            if ($this->description) echo wpautop(wptexturize($this->description));
        }

        public function receipt_page($order)
        {
            echo '<p>' . $this->getLangText('Thank you for your order, please click the button below to pay with Credit Card.') . '</p>';
            echo $this->generate_shopier_form($order);
        }

        public function generate_shopier_form($order_id)
        {
            global $woocommerce;

            $order = new WC_Order($order_id);

            $user_id = $order->user_id;
            $user = new WP_User($user_id);
            $user_registered = $user->user_registered;
            $time_elapsed = time() - strtotime($user_registered);
            $buyer_account_age = (int)($time_elapsed / 86400);

            $currency = $order->get_order_currency();
            if ($currency == 'USD') {
                $currency = 1;
            } else if ($currency == 'EUR') {
                $currency = 2;
            } else {
                $currency = 0;
            }

            $producttype = '2';
            $products = [];
            $orderGetData = $order->get_data();

            $generalInfo = array(
                'discount_total' => $orderGetData['discount_total'],
                'discount_tax' => $orderGetData['discount_tax'],
                'shipping_total' => $orderGetData['shipping_total'],
                'shipping_tax' => $orderGetData['shipping_tax'],
                'cart_tax' => $orderGetData['cart_tax'],
                'total' => $orderGetData['total'],
                'total_tax' => $orderGetData['total_tax'],
                'order_key' => $orderGetData['order_key'],
            );

            foreach ($order->get_items('shipping') as $itemId => $item) {
                $item_data = $item->get_data();
                $generalInfo['shipping_method'] = [
                    'id' => $item_data['method_id'],
                    'title' => $item_data['method_title']
                ];
            }

            $generalInfo['coupon_codes'] = null;
            foreach ($order->get_coupon_codes() as $coupon_code) {
                $coupon = new WC_Coupon($coupon_code);
                $discount_type = $coupon->get_discount_type();
                $coupon_amount = $coupon->get_amount();

                $generalInfo['coupon_codes']['code'] = $coupon_code;
                $generalInfo['coupon_codes']['discount_type'] = $discount_type;
                $generalInfo['coupon_codes']['coupon_amount'] = $coupon_amount;
            }


            $items = $order->get_items();

            foreach ($items as $item) {
                $productNames .= $item['name'].';';
                $product = $item->get_product();
                $product_id = $item['product_id'];

                if ($producttype != 0 && get_post_meta($product_id, '_virtual', true) == 'yes') {
                    $producttype = 1;
                } else if ($producttype != 0 && get_post_meta($product_id, '_downloadable', true) == 'yes') {
                    $producttype = 1;
                } else {
                    $producttype = 0;
                }

                $productName = $item['name'];
                $productName = str_replace('"', '', $productName);
                $productName = str_replace('&quot;', '', $productName);
                $expProductName = explode('-', $productName);


                $variationNames = [];
                if( $product->is_type('variation') ){
                    $variation_attributes = $product->get_variation_attributes();
                    foreach($variation_attributes as $attribute_taxonomy => $term_slug ){
                        $taxonomy = str_replace('attribute_', '', $attribute_taxonomy );
                        $attribute_name = wc_attribute_label( $taxonomy, $product );
                        if( taxonomy_exists($taxonomy) ) {
                            $variationNames[] = trim(get_term_by( 'slug', $term_slug, $taxonomy )->name);
                        } else {
                            $variationNames[] =
                                trim($term_slug);
                        }
                    }
                }


                $products[] = array(
                    'name' => trim($expProductName[0]),
                    'product_id' => $item['product_id'],
                    'product_type' => $producttype,
                    'quantity' => $item['quantity'],
                    'variation' => $variationNames,
                    'price' => $product->get_regular_price(),
                    'discount_price' => $product->get_sale_price() ? $product->get_sale_price() : null,
                    'subtotal_price' => $item['subtotal'],
                    'total_price' => $item['total'],
                    'subtotal_tax' => $item['subtotal_tax'],
                    'total_tax' => $item['total_tax'],
                );
            }

            $productNames = str_replace('"','',$productNames);
            $productNames = str_replace('&quot;','',$productNames);
            $current_language = get_bloginfo("language");
            $current_lan = 0;
            if ($current_language == "tr-TR") {
                $current_lan = 0;
            }
            $modul_version = ('2.0.0');
            srand(time());
            $random_number = rand(100000, 999999);

            if ($this->use_adress == 0) {
                $args = array
                (
                    'API_key' => $this->api_key,
                    'website_index' => $this->website_index,
                    'use_adress' => $this->use_adress,
                    'platform_order_id' => $order_id,
                    'product_info' => json_encode($products, JSON_UNESCAPED_UNICODE),
                    'general_info' => json_encode($generalInfo, JSON_UNESCAPED_UNICODE),
                    'product_name' => $productNames,
                    'product_type' => $producttype,
                    'buyer_name' => $order->billing_first_name,
                    'buyer_surname' => $order->billing_last_name,
                    'buyer_email' => $order->billing_email,
                    'buyer_account_age' => $buyer_account_age,
                    'buyer_id_nr' => $user_id,
                    'buyer_phone' => $order->billing_phone,
                    'billing_address' => $order->billing_address_1 . ' ' . $order->billing_address_2 . ' ' . $order->billing_state,
                    'billing_city' => $order->billing_city,
                    'billing_country' => $order->billing_country,
                    'billing_postcode' => $order->billing_postcode,
                    'shipping_address' => $order->shipping_address_1 . ' ' . $order->shipping_address_2 . ' ' . $order->shipping_state,
                    'shipping_city' => $order->shipping_city,
                    'shipping_country' => $order->shipping_country,
                    'shipping_postcode' => $order->shipping_postcode,
                    'total_order_value' => $order->order_total,
                    'currency' => $currency,
                    'platform' => 0,
                    'is_in_frame' => 0,
                    'current_language' => $current_lan,
                    'modul_version' => $modul_version,
                    'random_nr' => $random_number
                );
            } else if ($this->use_adress == 1) {
                $args = array
                (
                    'API_key' => $this->api_key,
                    'website_index' => $this->website_index,
                    'use_adress' => $this->use_adress,
                    'platform_order_id' => $order_id,
                    'product_info' => json_encode($products, JSON_UNESCAPED_UNICODE),
                    'general_info' => json_encode($generalInfo, JSON_UNESCAPED_UNICODE),
                    'product_name' => $productNames,
                    'product_type' => $producttype,
                    'buyer_name' => $order->shipping_first_name,
                    'buyer_surname' => $order->shipping_last_name,
                    'buyer_email' => $order->billing_email,
                    'buyer_account_age' => $buyer_account_age,
                    'buyer_id_nr' => $user_id,
                    'buyer_phone' => $order->billing_phone,
                    'billing_address' => $order->shipping_address_1 . ' ' . $order->shipping_address_2 . ' ' . $order->shipping_state,
                    'billing_city' => $order->shipping_city,
                    'billing_country' => $order->shipping_country,
                    'billing_postcode' => $order->shipping_postcode,
                    'shipping_address' => $order->billing_address_1 . ' ' . $order->billing_address_2 . ' ' . $order->billing_state,
                    'shipping_city' => $order->billing_city,
                    'shipping_country' => $order->billing_country,
                    'shipping_postcode' => $order->billing_postcode,
                    'total_order_value' => $order->order_total,
                    'currency' => $currency,
                    'platform' => 0,
                    'is_in_frame' => 0,
                    'current_language' => $current_lan,
                    'modul_version' => $modul_version,
                    'random_nr' => $random_number
                );
            }

            $data = $args["random_nr"] . $args["platform_order_id"] . $args["total_order_value"] . $args["currency"];
            $signature = hash_hmac('SHA256', $data, $this->secret, true);
            $signature = base64_encode($signature);
            $args['signature'] = $signature;

            $args_array = array();
            foreach ($args as $key => $value) {
                $value = $this->saveText($value);
                $args_array[] = "<input type='hidden' name='$key' value='$value'/>";
            }

            return '
			<form action="' . $this->payment_endpoint_url . '" method="post" id="shopier_payment_form">
				' . implode('', $args_array) . '
				<input type="submit" class="button-alt" id="submit_shopier_payment_form" value="' . $this->getLangText('Pay via Shopier') . '" /> 
				<a class="button cancel" href="' . $order->get_cancel_order_url() . '">
				' . $this->getLangText('Cancel order & restore cart') . '
				</a>
				<script type="text/javascript">
					jQuery(function(){
					jQuery("body").block({
						message: "' . $this->getLangText('Thank you for your order. We are now redirecting you to Payment Gateway to make payment') . '",
						overlayCSS:
						{
							background: "#fff",
								opacity: 0.6
						},
						css: {
							padding:        20,
								textAlign:      "center",
								color:          "#555",
								border:         "3px solid #aaa",
								backgroundColor:"#fff",
								cursor:         "wait",
								lineHeight:"32px"
						}
					});
					jQuery("#submit_shopier_payment_form").click();});
				</script>
			</form>';
        }

        public function process_payment($order_id)
        {
            $order = new WC_Order($order_id);
            return array('result' => 'success', 'redirect' => add_query_arg('order',
                //$order->id, add_query_arg('key', $order->order_key, get_permalink(get_option('woocommerce_pay_page_id'))))
                $order->id, add_query_arg('key', $order->order_key, $order->get_checkout_payment_url(true)))

            );
        }

        public function check_shopier_response()
        {
            global $woocommerce;
            if (isset($_REQUEST['platform_order_id'])) {
                $order_id = $_REQUEST['platform_order_id'];
                $status = $_REQUEST['status'];
                $payment_id = $_REQUEST['payment_id'];
                $installment = $_REQUEST['installment'];
                $random_nr = $_REQUEST['random_nr'];
                if ($order_id != '') {
                    try {
                        $order = new WC_Order($order_id);

                        $signature = base64_decode($_POST["signature"]);
                        $expected = hash_hmac('SHA256', $random_nr . $order_id, $this->secret, true);

                        $transauthorised = false;
                        if ($order->status !== 'completed') {
                            if ($signature == $expected) {
                                $status = strtolower($status);
                                if ($status == "success") {
                                    $transauthorised = true;
                                    $this->msg['message'] = $this->getLangText('Thank you for shopping with us. Your account has been charged and your transaction is successful. We will be shipping your order to you soon.');
                                    $this->msg['class'] = 'woocommerce_message';
                                    if ($order->status == 'processing') {

                                    } else {
                                        $order->payment_complete();
                                        update_post_meta($order_id, 'Shopier Payment ID', $payment_id);
                                        update_post_meta($order_id, 'Shopier Installment', $installment);
                                        $order->add_order_note($this->getLangText('Shopier payment successful'));
                                        $order->add_order_note($this->msg['message']);
                                        $woocommerce->cart->empty_cart();
                                        wp_redirect($this->get_return_url($order));
                                    }
                                } else {
                                    $this->msg['class'] = 'woocommerce_error';
                                    $this->msg['message'] = $this->getLangText('An error occurred in payment.The transaction has been declined.');
                                    $order->add_order_note($this->getLangText('Transaction Declined: ') . $_REQUEST['error_message']);
                                }
                            } else {
                                $this->msg['class'] = 'error';
                                $this->msg['message'] = $this->getLangText('Security Error. Illegal access detected');
                            }

                            add_action('the_content', array(&$this, 'showMessage'));
                            if ($transauthorised == false) {
                                $order->update_status('failed');
                                $order->add_order_note('Failed');
                                $order->add_order_note($this->msg['message']);
                                wc_add_notice($this->msg['message'], 'error');
                                $redirect_url = wc_get_page_permalink('checkout');
                                wp_redirect($redirect_url);
                            }
                        }
                    } catch (Exception $e) {
                        $msg = "Error";
                    }
                }
            }
        }

        public function showMessage($content)
        {
            return '<div class="box ' . $this->msg['class'] . '-box">' . $this->msg['message'] . '</div>' . $content;
        }
    }

    /**
     * Add the Gateway to WooCommerce
     **/
    function woocommerce_add_shopier_gateway($methods)
    {
        $methods[] = 'WC_Shopier';
        return $methods;
    }

    add_filter('woocommerce_payment_gateways', 'woocommerce_add_shopier_gateway');

    function getLangTextOutside($text)
    {
        $lang = trim(get_bloginfo("language"));
        $lang_file = __DIR__ . "/lang/{$lang}.php";
        if (!file_exists($lang_file)) {
            $lang_file = __DIR__ . "/lang/en-US.php";
        }
        require_once($lang_file);
        if (isset($shopierText[$text]) && !empty($shopierText[$text])) {
            return $shopierText[$text];
        } else {
            return $text;
        }
    }
}