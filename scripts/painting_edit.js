// client side javascript for painting info editing

const form = document.getElementById('painting_edit_form');
//const button = document.getElementById('painting_update');
const messageBox = document.getElementById('message');
const idField = document.getElementById('painting_id');
const titleField = document.getElementById('painting_title');
const descField = document.getElementById('painting_desc');

//button.addEventListener('click', () => {
form.addEventListener('submit', (event) => {

    // keep the browser from submitting the form
    event.preventDefault();

    //    const formData = new FormData(form);
    const formData = {id: idField.value,
		      title: titleField.value,
		      description: descField.value};

    fetch('/update_ajax', {
	method: 'POST',
	headers: {
            'Content-Type': 'application/json' // Crucial!
	},
	body: JSON.stringify(formData)
    }).then(response => response.json()).then(data => {
	messageBox.innerText = "painting info updated";
	console.log(data);
    }).catch(error => {
	messageBox.innerText = "error updating painting info";
    });
});
