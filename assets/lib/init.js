function showMenu(){
  $(".navbar-sc").addClass('active');
  $('.overlay-screen').show();
}
function closeOverlay(){
  $(".navbar-sc").removeClass('active');
  $('.overlay-screen').hide();
}
function showFormLogin(){
  $('.loginForm').addClass('active');
  $('.btn-choose').hide();
  $('.sign-upF').show();
  $('.loginF').hide();
}
function showFormSignup(){
  $('.signUpForm').addClass('active');
  $('.btn-choose').hide();
  $('.sign-upF').hide();
  $('.loginF').show();
}
function backSignUp(){
  $('.signUpForm').addClass('active');
  $('.loginForm').removeClass('active');
  $('.loginF').show();
}
function backLogin(){
  $('.signUpForm').removeClass('active');
  $('.loginForm').addClass('active');
  $('.sign-upF').show();
}
(function($) {
  'Show tabs';
  $(document).on('show.bs.tab', '.nav-tabs-responsive [data-toggle="tab"]', function(e) {
    var $target = $(e.target);
    var $tabs = $target.closest('.nav-tabs-responsive');
    var $current = $target.closest('li');
    var $next = $current.next();
    var $prev = $current.prev();
    var updateDropdownMenu = function($el, position){
      $el
          .removeClass('pull-xs-left pull-xs-center pull-xs-right')
          .addClass( 'pull-xs-' + position );
    };
    $tabs.find('>li').removeClass('next prev');
    $prev.addClass('prev');
    $next.addClass('next');

    updateDropdownMenu( $prev, 'left' );
    updateDropdownMenu( $current, 'center' );
    updateDropdownMenu( $next, 'right' );
  });
})(jQuery);