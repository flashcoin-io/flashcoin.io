var list = "";
var capital = { "latest":
  [{'cap':'New York','coun':'USA'},
    {'cap':'New Delhi','coun':'India'},
      {'cap':'Beijing','coun':'China'},
        {'cap':'London','coun':'UK'},
        {'cap':'Cairo','coun':'Egypt'},
  {'cap':'Paris','coun':'France'},
  {'cap':'Colombo','coun':'Sri Lanka'},
  {'cap':'Dhaka','coun':'Bangladesh'}]
};
var blurring = [];
var expecting = false;
var m = false;
var index = -1;
var divclick = false;

$(document).ready(function() {

$.each(capital.latest, function(k,v) {
  list += "<div class="+'capitals'+"><p class="+'country'+">"+v.coun+"</p><p class="+'capital'+">"+v.cap+"</p></div>";
});

//$(".results").append(list);

$("#searchfield").focus(function () {
  $(this).val('').keyup();
  $("#values").show();
});

$("#searchfield").blur(function () {
   blurring.push(1);
  setTimeout(function() {
	$('.results').find('.capitals').removeClass('selected');
	$('.results').empty();
	index = -1;
    $("#values").hide();
    blurring.pop();
    checkclick();
  },500);
});

$("#searchfield").keyup(function(e)
{
						if(e.which == 38){
							  index--;
							// Check that we've not tried to select before the first item
							if(index < 0){
								index = 0;
							}
							change_selection();
						}else if(e.which == 40){
							index++;
							// Check that index is not beyond the last item
							if(index > $('.results').find('.capitals').length - 1){
								index = $('.results').find('.capitals').length-1;
							}
							change_selection();
						}
						
						else if(e.which == 27){
							index = -1;
							// Esc key
							$options.removeClass('selected');
							$("#values").hide();
						}else if(e.which == 13){
							// Enter key
							if(index > -1){
								if($('.results').find('.capitals').hasClass('selected'))
								{
									$('.results').find('.selected').click();
									index=-1;
									$('.results').find('.capitals').removeClass('selected');
                                  
                                  
								}
							}
						}
						else
						{
							var nomatch =0;
							index = -1;
							$('.results').empty();
							if($(jQuery.trim($(this).val()).length >= 0))
							{
							    var filter = $(this).val();
								$search = new RegExp(filter.replace(/[^0-9a-z_]/i), 'i');
								for(var i in capital.latest)
								{
									if(capital.latest[i].coun.match($search))
									{
									var couny = capital.latest[i].coun;
									var reg = new RegExp(filter,"i");
									var n = couny.match(reg);
									var p = couny.replace(reg, "<b>"+n+"</b>");
									$('.results').append($("<div class='capitals'><p class='country'>"+p+"</p><p class='capital'>"+capital.latest[i].cap+"</p></div>"));
									nomatch = 1;
									$(".no-match").hide();
									}
								}
							   if(nomatch === 0)
							  {
								  $(".no-match").show();
							  }
							  
							  }
							 
							
							  else
							  {
								$(this).val('');
								$(".no-match").hide();
								nomatch =0;
							  }
						}
});

$("#searchfield").keydown( function(e) 
{
	if(e.which == 38 || e.which == 40 || e.which == 13){
		e.preventDefault();
	}
});

  $(".results").delegate('.capitals','click', function() {
  var a = $(this).find("p.country").text();
  var b = $(this).find("p.capital").text();
  $("#searchfield").val(a+'--'+b);
  $("#values").hide();
});

$("#again").click( function() {
  expecting = true;
  checkclick();
});

function checkclick() {
  if( expecting && blurring.length < 1)
  {
    expecting = false;
    clickfunction();
  }
  else
  {
  }
}

function clickfunction()
{
  $("#values").hide();
  $("#searchfield").val('').keyup();
  $("#searchfield").focus();
}



function change_selection()
{
  $('.results').find('.capitals').removeClass('selected');
  $('.results').find('.capitals').eq(index).addClass('selected');
  if( $('.selected').position().top + $('.selected').height() >= $('.results').scrollTop()+$('.results').height()){
  $('.results').scrollTop($('.selected').position().top - $('.results').height() + $('.results').scrollTop())
  }else if($('.selected').position().top <= $('.results').scrollTop()){
    $('.results').scrollTop($('.selected').position().top - 5)
  }
}
 

});
